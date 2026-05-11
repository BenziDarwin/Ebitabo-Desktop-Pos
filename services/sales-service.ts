import type {
  BusinessDetails,
  CartItem,
  Client,
  SalePaymentMethod,
} from "@/core/entities";
import { isSalesBusinessAccountType } from "@/lib/business-account-type";
import { STORAGE_KEYS } from "@/lib/constants";
import { isElectronRenderer } from "@/lib/runtime";
import { Storage } from "@/lib/storage";
import {
  readLocalProducts,
  readLocalProductClients,
  readLocalServiceClients,
  writeLocalProductClients,
  writeLocalServiceClients,
} from "@/services/repositories/local-catalog-storage";
import { toProxyPath } from "@/services/repositories/proxy-path";
import { sendRequestModel } from "@/services/repositories/send-request";

export type { SalePaymentMethod } from "@/core/entities";

interface ProductSaleLine {
  item_sold: number;
  number_sold: number;
  currency_id: number;
  item_name: string;
  unit_cost: number;
  total_amount: number;
  item_quantity: number;
  item_new_quantity: number;
}

interface ServiceSaleLine {
  item_type: "Service" | "Product";
  item_sold_product_name: string;
  item_sold_product?: number;
  item_sold_service?: number;
  number_sold: number;
  item_product_quantity?: number;
  item_product_new_quantity?: number;
  unit_cost: number;
  total_amount: number;
  currency_id: number;
}

interface PaymentLine {
  modePayment: SalePaymentMethod;
  datePayment: string;
  advancedAmount: number;
  amountPaid: number;
  currency_id: number;
}

interface CreateSalePayloadBase {
  client_id: number;
  reference: string;
  dateSale: string;
  totalDiscount: number;
  create_uid: number;
  description?: string;
  payment_lines: PaymentLine[];
}

interface CreateProductSalePayload extends CreateSalePayloadBase {
  items_sold_lines: ProductSaleLine[];
}

interface CreateServiceSalePayload extends CreateSalePayloadBase {
  items_sold_lines: ServiceSaleLine[];
}

interface CreateSaleApiRequest<TValues> {
  fields: string[];
  values: TValues;
}

interface CreateSaleFromCartInput {
  business: BusinessDetails;
  cart: CartItem[];
  client: Client;
  paymentMethod: SalePaymentMethod;
  amountPaid: number;
  currencyId: number;
  subtotal: number;
  discount: number;
  discountType: "amount" | "percent";
  createdBy?: string;
}

const CREATE_SALE_FIELDS = ["id", "client_id", "reference"];

function normalizeClientUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function isHtmlResponse(text: string): boolean {
  return /^<!doctype html>|^<html/i.test(text.trim());
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveNumber(value: unknown, fallback = 0): number {
  return Math.max(0, toNumber(value, fallback));
}

function readNumericId(value: unknown): number | null {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

function toDateOnlyString(value: Date): string {
  return value.toISOString().split("T")[0];
}

function isSalesBusiness(accountType?: string | null): boolean {
  return isSalesBusinessAccountType(accountType);
}

function generateSaleReference(prefix: "Sale" | "Service"): string {
  const randomNumber = Math.floor(Math.random() * 999999) + 1;
  return `${prefix}RCTm-${String(randomNumber).padStart(6, "0")}`;
}

function resolveDiscountPercent(
  discount: number,
  discountType: "amount" | "percent",
  subtotal: number,
): number {
  if (discountType === "percent") {
    return toPositiveNumber(discount);
  }
  if (subtotal <= 0) {
    return 0;
  }
  return (toPositiveNumber(discount) / subtotal) * 100;
}

function mapCreateUid(userId: string): number {
  return toPositiveNumber(userId);
}

function mapClientId(client: Client): number {
  return toPositiveNumber(client.id);
}

function buildProductStockMap(): Map<string, number> {
  const stocks = new Map<string, number>();
  for (const product of readLocalProducts()) {
    stocks.set(String(product.id), toPositiveNumber(product.stock));
  }
  return stocks;
}

function getSalesClientModel(accountType?: string | null): string {
  return isSalesBusiness(accountType)
    ? "the_sales.business_clients"
    : "services.business_clients";
}

function readLocalBusinessClients(accountType?: string | null): Client[] {
  return isSalesBusiness(accountType)
    ? readLocalProductClients()
    : readLocalServiceClients();
}

function writeLocalBusinessClients(
  accountType: string | null | undefined,
  clients: Client[],
): void {
  if (isSalesBusiness(accountType)) {
    writeLocalProductClients(clients);
    return;
  }
  writeLocalServiceClients(clients);
}

function getSaleModel(accountType?: string | null): string {
  return isSalesBusiness(accountType)
    ? "the_sales.the_sales"
    : "services.service_sales";
}

export function extractRemoteSaleId(response: unknown): number | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const record = response as Record<string, unknown>;
  const direct = readNumericId(
    record.id ?? record.record_id ?? record.resultId,
  );
  if (direct) return direct;

  const newResource = record["New resource"];
  if (Array.isArray(newResource) && newResource.length > 0) {
    const first = newResource[0];
    if (first && typeof first === "object") {
      const nested = readNumericId((first as Record<string, unknown>).id);
      if (nested) return nested;
    }
  }

  const result = record.Result;
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (first && typeof first === "object") {
      const nested = readNumericId((first as Record<string, unknown>).id);
      if (nested) return nested;
    }
  }

  return null;
}

export function getCachedBusinessClients(
  accountType?: string | null,
): Client[] {
  return readLocalBusinessClients(accountType);
}

async function postSaleModel(
  model: string,
  payload: CreateSaleApiRequest<
    CreateProductSalePayload | CreateServiceSalePayload
  >,
): Promise<unknown> {
  const clientUrl = Storage.getItem(STORAGE_KEYS.clientUrl);
  const apiKey = Storage.getItem(STORAGE_KEYS.apiKey);

  if (!clientUrl || !apiKey) {
    throw new Error("Missing API session. Please login again.");
  }

  const queryParts = [`model=${encodeURIComponent(model)}`];
  if (isElectronRenderer()) {
    queryParts.push(`target=${encodeURIComponent(clientUrl)}`);
  }
  const proxyUrl = toProxyPath("/send_request", queryParts.join("&"));
  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
      "x-ebitabo-client-url": normalizeClientUrl(clientUrl),
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  const trimmed = raw.trim();

  if (!response.ok) {
    throw new Error(
      trimmed || `Sale request failed with status ${response.status}`,
    );
  }

  if (!trimmed) {
    return null;
  }

  if (isHtmlResponse(trimmed)) {
    throw new Error("Sale request returned HTML instead of JSON.");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Failed to parse create-sale response.");
  }
}

export async function fetchBusinessClients(
  accountType?: string | null,
): Promise<Client[]> {
  const cachedClients = readLocalBusinessClients(accountType);
  const model = getSalesClientModel(accountType);

  try {
    const records = await sendRequestModel(model, {
      fields: ["id", "name", "advancedAmount"],
    });

    const clients: Client[] = [];
    for (const record of records) {
      const id = String(record.id ?? "").trim();
      const name = String(record.name ?? "").trim();
      if (!id || !name) {
        continue;
      }

      clients.push({
        id,
        name,
        advancedAmount: toPositiveNumber(record.advancedAmount),
        createdAt: new Date(),
      });
    }

    // Keep local data intact when the remote returns no rows unexpectedly.
    if (clients.length > 0 || cachedClients.length === 0) {
      writeLocalBusinessClients(accountType, clients);
    }

    return clients.length > 0 ? clients : cachedClients;
  } catch (error) {
    console.error("[ClientSync] Failed to fetch clients from cloud", {
      accountType,
      error,
    });
    return cachedClients;
  }
}

export async function createSaleFromCart(
  input: CreateSaleFromCartInput,
): Promise<unknown> {
  const currencyId = toPositiveNumber(input.currencyId);
  const clientId = mapClientId(input.client);
  if (!clientId) {
    throw new Error("Selected client is invalid.");
  }

  const paymentLines: PaymentLine[] = [
    {
      modePayment: input.paymentMethod,
      datePayment: new Date().toISOString(),
      advancedAmount:
        input.paymentMethod === "Advance"
          ? toPositiveNumber(input.client.advancedAmount)
          : 0,
      amountPaid: toPositiveNumber(input.amountPaid),
      currency_id: currencyId,
    },
  ];

  const stockByProductId = buildProductStockMap();
  const totalDiscountPercent = resolveDiscountPercent(
    input.discount,
    input.discountType,
    input.subtotal,
  );
  const createUid = mapCreateUid(input.business.userId);
  const description = input.createdBy?.trim()
    ? `Created By ${input.createdBy.trim()}`
    : undefined;

  if (isSalesBusiness(input.business.account_type)) {
    const productItems = input.cart.filter((item) => Boolean(item.productId));
    if (productItems.length === 0) {
      throw new Error("Sales business checkout requires product items.");
    }

    const itemsSoldLines: ProductSaleLine[] = productItems.map((item) => {
      const sourceId = item.productId ?? item.id;
      const productId = toPositiveNumber(sourceId);
      const quantity = toPositiveNumber(item.quantity);
      const unitCost = toPositiveNumber(item.price);
      const currentStock = toPositiveNumber(
        stockByProductId.get(String(sourceId)),
      );

      return {
        item_sold: productId,
        number_sold: quantity,
        currency_id: currencyId,
        item_name: item.name,
        unit_cost: unitCost,
        total_amount: unitCost * quantity,
        item_quantity: currentStock,
        item_new_quantity: Math.max(0, currentStock - quantity),
      };
    });

    const payload: CreateSaleApiRequest<CreateProductSalePayload> = {
      fields: CREATE_SALE_FIELDS,
      values: {
        client_id: clientId,
        reference: generateSaleReference("Sale"),
        dateSale: toDateOnlyString(new Date()),
        totalDiscount: totalDiscountPercent,
        create_uid: createUid,
        description,
        items_sold_lines: itemsSoldLines,
        payment_lines: paymentLines,
      },
    };

    return postSaleModel(getSaleModel(input.business.account_type), payload);
  }

  const itemsSoldLines: ServiceSaleLine[] = input.cart.map((item) => {
    const isServiceItem = Boolean(item.serviceId);
    const quantity = toPositiveNumber(item.quantity);
    const unitCost = toPositiveNumber(item.price);
    const sourceId = isServiceItem
      ? item.serviceId
      : (item.productId ?? item.id);
    const numericId = toPositiveNumber(sourceId);
    const currentStock = !isServiceItem
      ? toPositiveNumber(stockByProductId.get(String(sourceId)))
      : undefined;

    return {
      item_type: isServiceItem ? "Service" : "Product",
      item_sold_product_name: item.name,
      item_sold_product: isServiceItem ? undefined : numericId,
      item_sold_service: isServiceItem ? numericId : undefined,
      number_sold: quantity,
      item_product_quantity: currentStock,
      item_product_new_quantity:
        currentStock === undefined
          ? undefined
          : Math.max(0, currentStock - quantity),
      unit_cost: unitCost,
      total_amount: unitCost * quantity,
      currency_id: currencyId,
    };
  });

  const payload: CreateSaleApiRequest<CreateServiceSalePayload> = {
    fields: CREATE_SALE_FIELDS,
    values: {
      client_id: clientId,
      reference: generateSaleReference("Service"),
      dateSale: toDateOnlyString(new Date()),
      totalDiscount: totalDiscountPercent,
      create_uid: createUid,
      description,
      items_sold_lines: itemsSoldLines,
      payment_lines: paymentLines,
    },
  };

  return postSaleModel(getSaleModel(input.business.account_type), payload);
}
