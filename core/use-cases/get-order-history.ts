import type { CompletedOrder } from "@/core/entities";
import type { HistoryRepository } from "@/core/repositories";

export class GetOrderHistoryUseCase {
  constructor(private readonly historyRepository: HistoryRepository) {}

  execute(limit = 20): Promise<CompletedOrder[]> {
    return this.historyRepository.getOrderHistory(limit);
  }
}
