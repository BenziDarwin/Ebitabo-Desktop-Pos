import type { CompletedOrder, OrderDraft } from "@/core/entities";
import type { CompleteOrderOptions } from "@/core/repositories";
import { completeOrderUseCase } from "@/services/container";

export function completeOrder(
  order: OrderDraft,
  userId: string,
  options?: CompleteOrderOptions,
): Promise<CompletedOrder> {
  return completeOrderUseCase.execute(order, userId, options);
}
