import { readLocalSalesRecords } from "@/services/repositories/local-sales-storage";

export interface PendingTransactionsSummary {
  count: number;
  totalAmount: number;
}

export function getPendingTransactionsSummary(): PendingTransactionsSummary {
  const records = readLocalSalesRecords();
  const pending = records.filter((record) => record.sync.status === "pending");
  return {
    count: pending.length,
    totalAmount: pending.reduce((sum, record) => sum + record.total, 0),
  };
}
