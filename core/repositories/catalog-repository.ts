import type { Product, Service } from "@/core/entities";

export interface CatalogRepository {
  getProducts(): Promise<Product[]>;
  searchProducts(query: string): Promise<Product[]>;
  getServices(): Promise<Service[]>;
}
