import type { CompletedOrder, SalesSummary, TopProduct } from "@/core/entities";
import {
  getCompletedOrdersUseCase,
  getOrderHistoryUseCase,
  getTodaySalesUseCase,
  getTopProductsUseCase,
} from "@/services/container";

export function getCompletedOrders(): Promise<CompletedOrder[]> {
  return getCompletedOrdersUseCase.execute();
}

export function getOrderHistory(limit = 20): Promise<CompletedOrder[]> {
  return getOrderHistoryUseCase.execute(limit);
}

export function getTodaySalesData(userId?: string): Promise<SalesSummary> {
  return getTodaySalesUseCase.execute(userId);
}

export function getTopProducts(): Promise<TopProduct[]> {
  return getTopProductsUseCase.execute();
}
