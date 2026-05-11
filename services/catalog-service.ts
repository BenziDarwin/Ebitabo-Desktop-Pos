import type { Product, Service } from "@/core/entities";
import { getProductsUseCase, getServicesUseCase } from "@/services/container";
import { STORAGE_KEYS } from "@/lib/constants";
import { isSalesBusinessAccountType } from "@/lib/business-account-type";
import { Storage } from "@/lib/storage";
import {
  readLocalProducts,
  readLocalServices,
  writeLocalProducts,
  writeLocalServices,
} from "@/services/repositories/local-catalog-storage";

const LOG_PREFIX = "[CatalogSync]";

interface BusinessSnapshot {
  account_type?: string;
}

export interface CatalogSyncResult {
  products: number;
  services: number;
  syncedAt: Date;
}

function isSalesBusinessAccount(): boolean {
  const business = Storage.getJson<BusinessSnapshot | null>(
    STORAGE_KEYS.businessDetails,
    null,
  );
  return isSalesBusinessAccountType(business?.account_type);
}

function searchWithinProducts(products: Product[], query: string): Product[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return products;

  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(needle) ||
      product.sku.toLowerCase().includes(needle) ||
      product.category.toLowerCase().includes(needle),
  );
}

export async function syncCatalogFromCloud(): Promise<CatalogSyncResult> {
  console.info(`${LOG_PREFIX} sync started`);
  const apiKey = Storage.getItem(STORAGE_KEYS.apiKey);
  const clientUrl = Storage.getItem(STORAGE_KEYS.clientUrl);
  const isSalesBusiness = isSalesBusinessAccount();
  const previousProducts = readLocalProducts();
  const previousServices = readLocalServices();
  console.info(`${LOG_PREFIX} local cache before sync`, {
    products: previousProducts.length,
    services: previousServices.length,
    hasApiKey: Boolean(apiKey),
    hasClientUrl: Boolean(clientUrl),
    isSalesBusiness,
  });

  // Avoid replacing local catalog with empty data when session keys are not ready yet.
  if (!apiKey || !clientUrl) {
    console.warn(`${LOG_PREFIX} sync skipped due to missing auth context`);
    return {
      products: previousProducts.length,
      services: previousServices.length,
      syncedAt: new Date(),
    };
  }

  const cloudProducts = await getProductsUseCase.execute().catch((error) => {
    console.error(`${LOG_PREFIX} cloud products fetch failed`, error);
    return [];
  });

  const cloudServices = isSalesBusiness
    ? []
    : await getServicesUseCase.execute().catch((error) => {
        console.error(`${LOG_PREFIX} cloud services fetch failed`, error);
        return [];
      });
  console.info(`${LOG_PREFIX} cloud fetch completed`, {
    cloudProducts: cloudProducts.length,
    cloudServices: cloudServices.length,
    isSalesBusiness,
  });

  if (cloudProducts.length > 0 || previousProducts.length === 0) {
    console.info(`${LOG_PREFIX} writing local products`, {
      count: cloudProducts.length,
      replacingEmptyCache: previousProducts.length === 0,
    });
    writeLocalProducts(cloudProducts);
  } else {
    console.warn(`${LOG_PREFIX} product write skipped to avoid clearing cache`);
  }

  if (isSalesBusiness) {
    console.info(
      `${LOG_PREFIX} account type is Sales Business; clearing services`,
    );
    writeLocalServices([]);
  } else if (cloudServices.length > 0 || previousServices.length === 0) {
    console.info(`${LOG_PREFIX} writing local services`, {
      count: cloudServices.length,
      replacingEmptyCache: previousServices.length === 0,
    });
    writeLocalServices(cloudServices);
  } else {
    console.warn(`${LOG_PREFIX} service write skipped to avoid clearing cache`);
  }

  const syncedAt = new Date();
  Storage.setItem(STORAGE_KEYS.catalogLastSyncedAt, syncedAt.toISOString());
  const persistedProducts = readLocalProducts().length;
  const persistedServices = readLocalServices().length;
  console.info(`${LOG_PREFIX} sync finished`, {
    persistedProducts,
    persistedServices,
    syncedAt: syncedAt.toISOString(),
  });

  return {
    products: persistedProducts,
    services: persistedServices,
    syncedAt,
  };
}

export function getProducts(): Promise<Product[]> {
  return Promise.resolve(readLocalProducts());
}

export function searchProducts(query: string): Promise<Product[]> {
  return Promise.resolve(searchWithinProducts(readLocalProducts(), query));
}

export function getServices(): Promise<Service[]> {
  return Promise.resolve(readLocalServices());
}
