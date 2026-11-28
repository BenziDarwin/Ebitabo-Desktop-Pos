import type { CartItem, OrderDraft } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import {
  sendRequestModel,
  type SendRequestPayload,
} from "@/services/repositories/send-request";

export interface EbPosOrderLine {
  item_type: "Product" | "Service";
  product_id?: number;
  service_id?: number;
  item_name: string;
  number_sold: number;
  unit_cost: number;
  total_amount: number;
}

export interface EbPosOrderPayload {
  fields: string[];
  values: {
    order_ref: string;
    order_type: "sale" | "service";
    order_date: string;
    served_by: string;
    state: "created" | "completed" | "cancelled";
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    create_uid: number;
    user_id: number;
    line_ids: EbPosOrderLine[];
  };
}

export function resolveNumericUserId(
  userId?: string | number | null,
  businessUserId?: string | number | null,
): number {
  const candidates = [userId, businessUserId];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") {
      continue;
    }
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

export function formatOdooDate(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export async function sendOrderStatus(
  order: OrderDraft,
  state: "created" | "completed" | "cancelled",
  options?: {
    servedBy?: string;
    userId?: number;
    subtotal?: number;
    total?: number;
  },
): Promise<Record<string, unknown>[]> {
  const hasService = order.items.some((i) => Boolean(i.serviceId));
  const orderType: "service" | "sale" = hasService ? "service" : "sale";
  const orderRef = order.reference || order.id;
  const servedBy =
    options?.servedBy?.trim() || order.servedBy?.trim() || "Staff";
  const userId = Number(options?.userId ?? order.userId ?? 1) || 1;

  const subtotal = options?.subtotal ?? order.subtotal ?? 0;
  const total = options?.total ?? order.total ?? subtotal;

  const line_ids: EbPosOrderLine[] = order.items.map((item) => {
    const rawItem = item as unknown as Record<string, unknown>;
    const isService =
      Boolean(item.serviceId) ||
      rawItem.item_sold_service != null ||
      rawItem.item_type === "Service";
    const unitCost = Number(item.price ?? rawItem.unit_cost) || 0;
    const qty = Number(item.quantity ?? rawItem.number_sold) || 0;
    const lineTotal =
      Number(item.subtotal ?? rawItem.total_amount) || unitCost * qty;

    if (isService) {
      const serviceId =
        Number(
          item.serviceId ??
            rawItem.service_id ??
            rawItem.item_sold_service ??
            item.id,
        ) || 0;
      return {
        item_type: "Service",
        service_id: serviceId,
        item_name:
          item.name ||
          String(rawItem.item_name || "") ||
          `Service #${serviceId}`,
        number_sold: qty,
        unit_cost: unitCost,
        total_amount: lineTotal,
      };
    }

    const productId =
      Number(
        item.productId ??
          rawItem.product_id ??
          rawItem.item_sold_product ??
          rawItem.item_sold ??
          item.id,
      ) || 0;
    return {
      item_type: "Product",
      product_id: productId,
      item_name:
        item.name || String(rawItem.item_name || "") || `Item #${productId}`,
      number_sold: qty,
      unit_cost: unitCost,
      total_amount: lineTotal,
    };
  });

  const payload: EbPosOrderPayload = {
    fields: [
      "id",
      "order_ref",
      "order_type",
      "order_date",
      "served_by",
      "subtotal",
      "tax_amount",
      "total_amount",
      "state",
      "line_ids",
    ],
    values: {
      order_ref: orderRef,
      order_type: orderType,
      order_date: formatOdooDate(order.createdAt),
      served_by: servedBy,
      state,
      subtotal,
      tax_amount: order.tax || 0.0,
      total_amount: total,
      create_uid: userId,
      user_id: userId,
      line_ids,
    },
  };

  const clientUrl = Storage.getItem(STORAGE_KEYS.clientUrl);
  const apiKey = Storage.getItem(STORAGE_KEYS.apiKey);
  if (!clientUrl || !apiKey) {
    return [];
  }

  const records = await sendRequestModel(
    "eb_pos.order",
    payload as unknown as SendRequestPayload,
  );
  if (!records || records.length === 0) {
    throw new Error(
      `Failed to sync order ${orderRef} with state ${state} to server.`,
    );
  }
  return records;
}

export async function fetchServerOrders(
  userId: number,
  limit: number = 50,
): Promise<OrderDraft[]> {
  if (!userId) return [];
  const clientUrl = Storage.getItem(STORAGE_KEYS.clientUrl);
  const apiKey = Storage.getItem(STORAGE_KEYS.apiKey);
  if (!clientUrl || !apiKey) return [];

  const orderPayload = {
    fields: [
      "id",
      "order_ref",
      "order_type",
      "order_date",
      "served_by",
      "subtotal",
      "tax_amount",
      "total_amount",
      "state",
      "line_ids",
    ],
    domain: [["create_uid", "=", userId]],
    page_no: 1,
    limit,
  };

  let rawOrders: Record<string, unknown>[];
  try {
    rawOrders = await sendRequestModel(
      "eb_pos.order",
      orderPayload as unknown as SendRequestPayload,
    );
  } catch (err) {
    console.warn("[eb_pos.order] Failed to fetch server orders:", err);
    return [];
  }

  if (!rawOrders || rawOrders.length === 0) {
    return [];
  }

  const orderIds = rawOrders
    .map((r) => Number(r.id))
    .filter((id) => Boolean(id) && !Number.isNaN(id));

  const linesByOrderId = new Map<number, CartItem[]>();

  if (orderIds.length > 0) {
    try {
      const linePayload = {
        fields: [
          "id",
          "order_id",
          "product_id",
          "service_id",
          "item_name",
          "number_sold",
          "unit_cost",
          "total_amount",
          "item_type",
        ],
        domain: [["order_id", "in", orderIds]],
        limit: 200,
      };

      const rawLines = await sendRequestModel(
        "eb_pos.order_line",
        linePayload as unknown as SendRequestPayload,
      );

      for (const line of rawLines) {
        const rawOrderId = Array.isArray(line.order_id)
          ? line.order_id[0]
          : line.order_id;
        const oId = Number(rawOrderId);
        if (!oId) continue;

        const isService =
          line.item_type === "Service" ||
          (Boolean(line.service_id) && line.item_type !== "Product");
        const rawProductId = Array.isArray(line.product_id)
          ? line.product_id[0]
          : line.product_id;
        const prodName = Array.isArray(line.product_id)
          ? String(line.product_id[1] ?? "")
          : String(line.item_name ?? "");
        const productId = Number(rawProductId) || 0;

        const rawServiceId = Array.isArray(line.service_id)
          ? line.service_id[0]
          : line.service_id;
        const serviceName = Array.isArray(line.service_id)
          ? String(line.service_id[1] ?? "")
          : String(line.item_name ?? "");
        const serviceId = Number(rawServiceId) || 0;

        const qty = Number(line.number_sold) || 1;
        const unitCost = Number(line.unit_cost) || 0;
        const totalAmount = Number(line.total_amount) || unitCost * qty;

        const itemName =
          String(line.item_name || "").trim() ||
          (isService ? serviceName : prodName) ||
          (isService ? `Service #${serviceId}` : `Item #${productId}`);

        const cartItem: CartItem = {
          id: isService
            ? `srv-${serviceId || line.id}`
            : `prod-${productId || line.id}`,
          name: itemName,
          price: unitCost,
          quantity: qty,
          tax: 0,
          subtotal: totalAmount,
          serviceId: isService ? String(serviceId) : undefined,
          productId: !isService ? String(productId) : undefined,
        };

        const existing = linesByOrderId.get(oId) || [];
        existing.push(cartItem);
        linesByOrderId.set(oId, existing);
      }
    } catch (err) {
      console.warn(
        "[eb_pos.order_line] Failed to fetch server order lines:",
        err,
      );
    }
  }

  return rawOrders.map((rec) => {
    const orderId = Number(rec.id);
    const lines = linesByOrderId.get(orderId) || [];
    const total = Number(rec.total_amount) || Number(rec.subtotal) || 0;
    const subtotal = Number(rec.subtotal) || total;
    const dateStr = String(rec.order_date || new Date().toISOString());
    const reference = String(rec.order_ref || `OrderRCTm-${orderId}`);
    const stateRaw = String(rec.state || "completed");
    const state: OrderDraft["state"] =
      stateRaw === "cancelled"
        ? "cancelled"
        : stateRaw === "completed"
          ? "completed"
          : "created";

    return {
      id: `server-${orderId}-${reference}`,
      reference,
      items: lines,
      subtotal,
      tax: Number(rec.tax_amount) || 0,
      total,
      discount: 0,
      discountType: "amount" as const,
      state,
      servedBy: rec.served_by ? String(rec.served_by) : undefined,
      userId: String(userId),
      createdAt: new Date(dateStr),
      updatedAt: new Date(dateStr),
    };
  });
}
