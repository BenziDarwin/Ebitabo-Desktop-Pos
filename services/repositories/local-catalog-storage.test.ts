import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product, Service } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";

const storageState = new Map<string, unknown>();
const failPersistKeys = new Set<string>();

const getJsonMock = vi.fn((key: string, fallback: unknown) => {
  return storageState.has(key) ? storageState.get(key) : fallback;
});

const setJsonMock = vi.fn((key: string, value: unknown) => {
  if (failPersistKeys.has(key)) {
    return false;
  }
  storageState.set(key, JSON.parse(JSON.stringify(value)));
  return true;
});

vi.mock("@/lib/storage", () => ({
  Storage: {
    getJson: getJsonMock,
    setJson: setJsonMock,
  },
}));

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p-1",
    name: "Product 1",
    sku: "P1",
    category: "Products",
    price: 100,
    stock: 5,
    tax: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildService(overrides: Partial<Service> = {}): Service {
  return {
    id: "s-1",
    name: "Service 1",
    price: 200,
    tax: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("local-catalog-storage", () => {
  beforeEach(() => {
    storageState.clear();
    failPersistKeys.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses in-memory fallback when product persistence fails", async () => {
    failPersistKeys.add(STORAGE_KEYS.catalogProducts);
    storageState.set(STORAGE_KEYS.catalogProducts, [
      {
        id: "old",
        name: "Old Product",
        sku: "OLD",
        category: "Products",
        price: 1,
        stock: 1,
        tax: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const repo = await import("@/services/repositories/local-catalog-storage");
    repo.writeLocalProducts([
      buildProduct({ id: "p-1", name: "New Product A" }),
      buildProduct({ id: "p-2", name: "New Product B", sku: "P2" }),
    ]);

    const products = repo.readLocalProducts();

    expect(products.map((entry) => entry.id)).toEqual(["p-1", "p-2"]);
    expect(setJsonMock).toHaveBeenCalledWith(
      STORAGE_KEYS.catalogProducts,
      expect.any(Array),
    );
  });

  it("strips oversized inline service images before persisting", async () => {
    const repo = await import("@/services/repositories/local-catalog-storage");
    const hugeInlineImage = `data:image/png;base64,${"a".repeat(9000)}`;
    repo.writeLocalServices([
      buildService({ image: hugeInlineImage }),
      buildService({ id: "s-2", name: "Service 2", image: "/web/image/2" }),
    ]);

    const persisted = storageState.get(STORAGE_KEYS.catalogServices) as Array<
      Record<string, unknown>
    >;

    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.image).toBeUndefined();
    expect(persisted[1]?.image).toBe("/web/image/2");
  });

  it("keeps full image values available in memory for immediate rendering", async () => {
    const repo = await import("@/services/repositories/local-catalog-storage");
    const hugeInlineImage = `data:image/png;base64,${"a".repeat(9000)}`;

    repo.writeLocalProducts([buildProduct({ image: hugeInlineImage })]);
    const products = repo.readLocalProducts();

    expect(products[0]?.image).toBe(hugeInlineImage);

    const persisted = storageState.get(STORAGE_KEYS.catalogProducts) as Array<
      Record<string, unknown>
    >;
    expect(persisted[0]?.image).toBeUndefined();
  });
});
