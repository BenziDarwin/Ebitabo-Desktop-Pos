import type { CompletedOrder } from "@/core/entities";
import type { HistoryRepository } from "@/core/repositories";

export class GetCompletedOrdersUseCase {
  constructor(private readonly historyRepository: HistoryRepository) {}

  execute(): Promise<CompletedOrder[]> {
    return this.historyRepository.getCompletedOrders();
  }
}
