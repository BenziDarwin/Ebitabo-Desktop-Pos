import type { CompletedOrder, OrderDraft } from "@/core/entities";

export interface OrderRepository {
  completeOrder(order: OrderDraft, userId: string): Promise<CompletedOrder>;
}
