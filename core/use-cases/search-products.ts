import type { Product } from "@/core/entities";
import type { CatalogRepository } from "@/core/repositories";

export class SearchProductsUseCase {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  execute(query: string): Promise<Product[]> {
    return this.catalogRepository.searchProducts(query);
  }
}
