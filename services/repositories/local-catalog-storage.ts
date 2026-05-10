import type { Product, Service } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

const LOG_PREFIX = "[CatalogSync]";

interface SerializedProduct extends Omit<Product, "createdAt"> {
  createdAt: string;
}

interface SerializedService extends Omit<Service, "createdAt"> {
  createdAt: string;
}

function serializeProduct(product: Product): SerializedProduct {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
  };
}

function deserializeProduct(product: SerializedProduct): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
  };
}

function serializeService(service: Service): SerializedService {
  return {
    ...service,
    createdAt: service.createdAt.toISOString(),
  };
}

function deserializeService(service: SerializedService): Service {
  return {
    ...service,
    createdAt: new Date(service.createdAt),
  };
}

export function readLocalProducts(): Product[] {
  const serialized = Storage.getJson<SerializedProduct[]>(
    STORAGE_KEYS.catalogProducts,
    [],
  );
  return serialized.map(deserializeProduct);
}

export function writeLocalProducts(products: Product[]): void {
  console.info(`${LOG_PREFIX} writeLocalProducts`, { count: products.length });
  Storage.setJson(STORAGE_KEYS.catalogProducts, products.map(serializeProduct));
}

export function readLocalServices(): Service[] {
  const serialized = Storage.getJson<SerializedService[]>(
    STORAGE_KEYS.catalogServices,
    [],
  );
  return serialized.map(deserializeService);
}

export function writeLocalServices(services: Service[]): void {
  console.info(`${LOG_PREFIX} writeLocalServices`, { count: services.length });
  Storage.setJson(STORAGE_KEYS.catalogServices, services.map(serializeService));
}
