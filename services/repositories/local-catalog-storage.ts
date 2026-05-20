import type { Client, Product, Service } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

const LOG_PREFIX = "[CatalogSync]";

interface SerializedProduct extends Omit<Product, "createdAt"> {
  createdAt: string;
}

interface SerializedService extends Omit<Service, "createdAt"> {
  createdAt: string;
}

interface SerializedClient extends Omit<Client, "createdAt"> {
  createdAt: string;
}

function sanitizeStoredImage(image?: string): string | undefined {
  if (typeof image !== "string") return undefined;
  const normalized = image.trim();
  if (!normalized) return undefined;

  const lower = normalized.toLowerCase();
  if (
    lower === "null" ||
    lower === "undefined" ||
    lower === "false" ||
    lower === "none"
  ) {
    return undefined;
  }

  return normalized;
}

function sanitizeStoredBarcode(value?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function serializeProduct(product: Product): SerializedProduct {
  return {
    ...product,
    image: sanitizeStoredImage(product.image),
    createdAt: product.createdAt.toISOString(),
  };
}

function deserializeProduct(product: SerializedProduct): Product {
  const sanitizedBarcode = sanitizeStoredBarcode(product.barcode);
  const fallbackBarcode = sanitizeStoredBarcode(product.sku);
  return {
    ...product,
    barcode: sanitizedBarcode ?? fallbackBarcode,
    createdAt: new Date(product.createdAt),
  };
}

function serializeService(service: Service): SerializedService {
  return {
    ...service,
    image: sanitizeStoredImage(service.image),
    createdAt: service.createdAt.toISOString(),
  };
}

function deserializeService(service: SerializedService): Service {
  return {
    ...service,
    createdAt: new Date(service.createdAt),
  };
}

function serializeClient(client: Client): SerializedClient {
  return {
    ...client,
    createdAt: client.createdAt.toISOString(),
  };
}

function deserializeClient(client: SerializedClient): Client {
  return {
    ...client,
    createdAt: new Date(client.createdAt),
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

export function readLocalProductClients(): Client[] {
  const serialized = Storage.getJson<SerializedClient[]>(
    STORAGE_KEYS.clientsProducts,
    [],
  );
  return serialized.map(deserializeClient);
}

export function writeLocalProductClients(clients: Client[]): void {
  console.info(`${LOG_PREFIX} writeLocalProductClients`, {
    count: clients.length,
  });
  Storage.setJson(STORAGE_KEYS.clientsProducts, clients.map(serializeClient));
}

export function readLocalServiceClients(): Client[] {
  const serialized = Storage.getJson<SerializedClient[]>(
    STORAGE_KEYS.clientsServices,
    [],
  );
  return serialized.map(deserializeClient);
}

export function writeLocalServiceClients(clients: Client[]): void {
  console.info(`${LOG_PREFIX} writeLocalServiceClients`, {
    count: clients.length,
  });
  Storage.setJson(STORAGE_KEYS.clientsServices, clients.map(serializeClient));
}
