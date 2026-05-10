import type { Service } from "@/core/entities";
import type { CatalogRepository } from "@/core/repositories";

export class GetServicesUseCase {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  execute(): Promise<Service[]> {
    return this.catalogRepository.getServices();
  }
}
