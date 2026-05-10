import type { CompletedOrder, OrderDraft } from "@/core/entities";
import { completeOrderUseCase } from "@/services/container";

export function completeOrder(
  order: OrderDraft,
  userId: string,
): Promise<CompletedOrder> {
  return completeOrderUseCase.execute(order, userId);
}
