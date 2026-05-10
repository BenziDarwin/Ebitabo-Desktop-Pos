import type { SalesSummary } from "@/core/entities";
import type { HistoryRepository } from "@/core/repositories";

export class GetTodaySalesUseCase {
  constructor(private readonly historyRepository: HistoryRepository) {}

  execute(userId?: string): Promise<SalesSummary> {
    return this.historyRepository.getTodaySalesData(userId);
  }
}
