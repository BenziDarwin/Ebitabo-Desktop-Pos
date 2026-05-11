import type { CompletedOrder, OrderDraft } from "@/core/entities";
import type {
  CompleteOrderOptions,
  OrderRepository,
} from "@/core/repositories";

export class CompleteOrderUseCase {
  constructor(private readonly orderRepository: OrderRepository) {}

  execute(
    order: OrderDraft,
    userId: string,
    options?: CompleteOrderOptions,
  ): Promise<CompletedOrder> {
    return this.orderRepository.completeOrder(order, userId, options);
  }
}
