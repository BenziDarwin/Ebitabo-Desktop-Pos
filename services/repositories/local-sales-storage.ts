import type { CompletedOrder } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

interface SerializedCompletedOrder extends Omit<
  CompletedOrder,
  "createdAt" | "updatedAt" | "completedAt"
> {
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

function toSerialized(order: CompletedOrder): SerializedCompletedOrder {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt.toISOString(),
  };
}

function fromSerialized(order: SerializedCompletedOrder): CompletedOrder {
  return {
    ...order,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    completedAt: new Date(order.completedAt),
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
