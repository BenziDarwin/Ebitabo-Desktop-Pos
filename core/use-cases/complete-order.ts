import type { CompletedOrder, OrderDraft } from "@/core/entities";
import type { OrderRepository } from "@/core/repositories";

export class CompleteOrderUseCase {
  constructor(private readonly orderRepository: OrderRepository) {}

  execute(order: OrderDraft, userId: string): Promise<CompletedOrder> {
    return this.orderRepository.completeOrder(order, userId);
  }
}
