import type {
  CompletedOrder,
  SalePaymentMethod,
  SaleSyncMetadata,
} from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

interface SerializedSaleSyncMetadata extends Omit<
  SaleSyncMetadata,
  "syncedAt"
> {
  syncedAt: string | null;
}

interface SerializedCompletedOrder extends Omit<
  CompletedOrder,
  "createdAt" | "updatedAt" | "completedAt" | "sync"
> {
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  sync?: SerializedSaleSyncMetadata;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePaymentMethod(value: unknown): SalePaymentMethod {
  if (value === "Cash") return "Cash";
  if (value === "Mobile Money") return "Mobile Money";
  if (value === "Bank Transfer") return "Bank Transfer";
  if (value === "Debit/Credit Card") return "Debit/Credit Card";
  if (value === "Advance") return "Advance";

  const lowered = String(value ?? "")
    .trim()
    .toLowerCase();
  if (lowered === "cash") return "Cash";
  if (lowered === "card") return "Debit/Credit Card";
  if (lowered === "transfer") return "Bank Transfer";
  if (lowered === "check") return "Bank Transfer";

  return "Cash";
}

function toSerialized(order: CompletedOrder): SerializedCompletedOrder {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt.toISOString(),
    sync: {
      ...order.sync,
      syncedAt: order.sync.syncedAt ? order.sync.syncedAt.toISOString() : null,
    },
  };
}

function fromSerialized(order: SerializedCompletedOrder): CompletedOrder {
  const fallbackStatus =
    order.sync?.status === "pending" ? "pending" : "synced";
  const fallbackAmountPaid = toNumber(order.total, 0);
  const rawPayments = Array.isArray(order.payments) ? order.payments : [];
  const parsedSyncedAt =
    order.sync?.syncedAt != null
      ? new Date(order.sync.syncedAt)
      : fallbackStatus === "synced"
        ? new Date(order.completedAt)
        : null;

  return {
    ...order,
    payments: rawPayments.map((payment) => ({
      ...payment,
      method: normalizePaymentMethod(payment.method),
      amount: toNumber(payment.amount, 0),
    })),
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    completedAt: new Date(order.completedAt),
    sync: {
      status: fallbackStatus,
      remoteSaleId:
        typeof order.sync?.remoteSaleId === "number"
          ? order.sync.remoteSaleId
          : null,
      syncedAt: parsedSyncedAt,
      lastSyncError:
        typeof order.sync?.lastSyncError === "string"
          ? order.sync.lastSyncError
          : null,
      paymentMethod: normalizePaymentMethod(
        order.sync?.paymentMethod ?? rawPayments[0]?.method,
      ),
      amountPaid: toNumber(order.sync?.amountPaid, fallbackAmountPaid),
      currencyId: toNumber(order.sync?.currencyId, 0),
      businessAccountType:
        typeof order.sync?.businessAccountType === "string"
          ? order.sync.businessAccountType
          : null,
      businessUserId: String(order.sync?.businessUserId ?? order.userId ?? ""),
      createdBy:
        typeof order.sync?.createdBy === "string"
          ? order.sync.createdBy
          : undefined,
    },
  };
}

export function readLocalSalesRecords(): CompletedOrder[] {
  const serialized = Storage.getJson<SerializedCompletedOrder[]>(
    STORAGE_KEYS.salesRecords,
    [],
  );
  return serialized.map(fromSerialized);
}

export function writeLocalSalesRecords(records: CompletedOrder[]): void {
  Storage.setJson(STORAGE_KEYS.salesRecords, records.map(toSerialized));
}
