import type { Client, Product, Service } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

const LOG_PREFIX = "[CatalogSync]";
const MAX_STORED_IMAGE_LENGTH = 2048;

interface SerializedProduct extends Omit<Product, "createdAt"> {
  createdAt: string;
}

interface SerializedService extends Omit<Service, "createdAt"> {
  createdAt: string;
}

interface SerializedClient extends Omit<Client, "createdAt"> {
  createdAt: string;
}

interface VolatileCatalogState {
  products: SerializedProduct[] | null;
  services: SerializedService[] | null;
  productClients: SerializedClient[] | null;
  serviceClients: SerializedClient[] | null;
}

const volatileCatalogState: VolatileCatalogState = {
  products: null,
  services: null,
  productClients: null,
  serviceClients: null,
};

function normalizeImageValue(image?: string): string | undefined {
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

function sanitizeStoredImage(image?: string): string | undefined {
  const normalized = normalizeImageValue(image);
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();

  // Avoid exhausting localStorage with large inline image blobs.
  if (lower.startsWith("data:")) return undefined;
  if (normalized.length > MAX_STORED_IMAGE_LENGTH) {
    return undefined;
  }

  return normalized;
}

function sanitizeStoredBarcode(value?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function serializeProduct(
  product: Product,
  options: { sanitizeImage: boolean },
): SerializedProduct {
  return {
    ...product,
    image: options.sanitizeImage
      ? sanitizeStoredImage(product.image)
      : normalizeImageValue(product.image),
    createdAt: product.createdAt.toISOString(),
  };
}

function deserializeProduct(product: SerializedProduct): Product {
  const sanitizedBarcode = sanitizeStoredBarcode(product.barcode);
  return {
    ...product,
    barcode: sanitizedBarcode,
    createdAt: new Date(product.createdAt),
  };
}

function serializeService(
  service: Service,
  options: { sanitizeImage: boolean },
): SerializedService {
  return {
    ...service,
    image: options.sanitizeImage
      ? sanitizeStoredImage(service.image)
      : normalizeImageValue(service.image),
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

function readSerializedCollection<T>(
  storageKey: string,
  volatileData: T[] | null,
): T[] {
  if (volatileData !== null) {
    return volatileData;
  }

  const stored = Storage.getJson<T[]>(storageKey, []);
  return Array.isArray(stored) ? stored : [];
}

export function readLocalProducts(): Product[] {
  const serialized = readSerializedCollection<SerializedProduct>(
    STORAGE_KEYS.catalogProducts,
    volatileCatalogState.products,
  );
  return serialized.map(deserializeProduct);
}

export function writeLocalProducts(products: Product[]): void {
  console.info(`${LOG_PREFIX} writeLocalProducts`, { count: products.length });
  const inMemorySerialized = products.map((product) =>
    serializeProduct(product, { sanitizeImage: false }),
  );
  volatileCatalogState.products = inMemorySerialized;

  const persistedSerialized = products.map((product) =>
    serializeProduct(product, { sanitizeImage: true }),
  );
  const didPersist = Storage.setJson(
    STORAGE_KEYS.catalogProducts,
    persistedSerialized,
  );
  if (!didPersist) {
    console.warn(`${LOG_PREFIX} writeLocalProducts persisted in memory only`, {
      count: inMemorySerialized.length,
    });
  }
}

export function readLocalServices(): Service[] {
  const serialized = readSerializedCollection<SerializedService>(
    STORAGE_KEYS.catalogServices,
    volatileCatalogState.services,
  );
  return serialized.map(deserializeService);
}

export function writeLocalServices(services: Service[]): void {
  console.info(`${LOG_PREFIX} writeLocalServices`, { count: services.length });
  const inMemorySerialized = services.map((service) =>
    serializeService(service, { sanitizeImage: false }),
  );
  volatileCatalogState.services = inMemorySerialized;

  const persistedSerialized = services.map((service) =>
    serializeService(service, { sanitizeImage: true }),
  );
  const didPersist = Storage.setJson(
    STORAGE_KEYS.catalogServices,
    persistedSerialized,
  );
  if (!didPersist) {
    console.warn(`${LOG_PREFIX} writeLocalServices persisted in memory only`, {
      count: inMemorySerialized.length,
    });
  }
}

export function readLocalProductClients(): Client[] {
  const serialized = readSerializedCollection<SerializedClient>(
    STORAGE_KEYS.clientsProducts,
    volatileCatalogState.productClients,
  );
  return serialized.map(deserializeClient);
}

export function writeLocalProductClients(clients: Client[]): void {
  console.info(`${LOG_PREFIX} writeLocalProductClients`, {
    count: clients.length,
  });
  const serialized = clients.map(serializeClient);
  volatileCatalogState.productClients = serialized;
  const didPersist = Storage.setJson(STORAGE_KEYS.clientsProducts, serialized);
  if (!didPersist) {
    console.warn(
      `${LOG_PREFIX} writeLocalProductClients persisted in memory only`,
      { count: serialized.length },
    );
  }
}

export function readLocalServiceClients(): Client[] {
  const serialized = readSerializedCollection<SerializedClient>(
    STORAGE_KEYS.clientsServices,
    volatileCatalogState.serviceClients,
  );
  return serialized.map(deserializeClient);
}

export function writeLocalServiceClients(clients: Client[]): void {
  console.info(`${LOG_PREFIX} writeLocalServiceClients`, {
    count: clients.length,
  });
  const serialized = clients.map(serializeClient);
  volatileCatalogState.serviceClients = serialized;
  const didPersist = Storage.setJson(STORAGE_KEYS.clientsServices, serialized);
  if (!didPersist) {
    console.warn(
      `${LOG_PREFIX} writeLocalServiceClients persisted in memory only`,
      { count: serialized.length },
    );
  }
}
