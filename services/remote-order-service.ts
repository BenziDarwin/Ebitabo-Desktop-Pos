import type { OrderDraft } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import { sendRequestModel } from "@/services/repositories/send-request";

export interface EbPosOrderLine {
  item_type: "Product" | "Service";
  product_id: number;
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
    state: "completed" | "cancelled";
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    create_uid: number;
    user_id: number;
    line_ids: EbPosOrderLine[];
  };
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
  state: "completed" | "cancelled",
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
    const isService = Boolean(item.serviceId);
    const rawId = isService ? item.serviceId : item.productId;
    const productId = Number(rawId) || 0;
    const unitCost = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const lineTotal = Number(item.subtotal) || unitCost * qty;

    return {
      item_type: isService ? "Service" : "Product",
      product_id: productId,
      item_name: item.name || `Item #${productId}`,
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
    payload as unknown as Record<string, unknown>,
  );
  if (!records || records.length === 0) {
    throw new Error(
      `Failed to sync order ${orderRef} with state ${state} to server.`,
    );
  }
  return records;
}
