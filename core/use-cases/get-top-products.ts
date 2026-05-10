import type { TopProduct } from "@/core/entities";
import type { HistoryRepository } from "@/core/repositories";

export class GetTopProductsUseCase {
  constructor(private readonly historyRepository: HistoryRepository) {}

  execute(): Promise<TopProduct[]> {
    return this.historyRepository.getTopProducts();
  }
}
