import type { CompletedOrder, SalesSummary, TopProduct } from "@/core/entities";

export interface HistoryRepository {
  getCompletedOrders(): Promise<CompletedOrder[]>;
  getOrderHistory(limit?: number): Promise<CompletedOrder[]>;
  getTodaySalesData(userId?: string): Promise<SalesSummary>;
  getTopProducts(): Promise<TopProduct[]>;
}
