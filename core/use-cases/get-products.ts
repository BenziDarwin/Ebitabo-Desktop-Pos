import type { Product } from "@/core/entities";
import type { CatalogRepository } from "@/core/repositories";

export class GetProductsUseCase {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  execute(): Promise<Product[]> {
    return this.catalogRepository.getProducts();
  }
}
