import type { Product, Service } from "@/core/entities";
import type { CatalogRepository } from "@/core/repositories";
import { sendRequestModel } from "@/services/repositories/send-request";

const LOG_PREFIX = "[CatalogSync]";

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function firstNonEmptyString(values: unknown[], fallback = ""): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function firstDefined(values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => key in record);
}

function looksLikeProductRecord(record: Record<string, unknown>): boolean {
  return hasAnyKey(record, [
    "id",
    "name",
    "product_name",
    "item_name",
    "salePrice",
    "quantityAtHand",
    "costPrice",
    "product_image",
  ]);
}

function looksLikeServiceRecord(record: Record<string, unknown>): boolean {
  return hasAnyKey(record, [
    "id",
    "name",
    "service_name",
    "item_name",
    "salePrice",
    "service_image",
  ]);
}

function mapProduct(record: Record<string, unknown>): Product {
  const rawId = String(
    firstDefined([
      record.id,
      record.product_id,
      record.item_id,
      record.item_sold,
      record.item_sold_product,
      record.default_code,
      record.sku,
      record.product_code,
      record.name,
      record.product_name,
      record.item_name,
    ]) ?? "",
  );
  const name = firstNonEmptyString(
    [
      record.name,
      record.product_name,
      record.item_name,
      record.item_sold_product_name,
      record.default_code,
      record.sku,
    ],
    "Unnamed Product",
  );
  const id = rawId || name;
  const price = toNumber(
    firstDefined([
      record.price,
      record.salePrice,
      record.unit_cost,
      record.amount,
      record.total_amount,
    ]),
  );
  const stock = toNumber(
    firstDefined([record.quantity, record.quantityAtHand]),
  );
  const tax = toNumber(firstDefined([record.tax, record.tax_rate, 0]));

  return {
    id,
    name,
    sku: firstNonEmptyString(
      [record.sku, record.default_code, record.product_code],
      id,
    ),
    barcode: firstNonEmptyString(
      [
        record.barcode,
        record.bar_code,
        record.ean13,
        record.ean,
        record.upc,
        record.default_code,
        record.sku,
      ],
      "",
    ),
    category: firstNonEmptyString(
      [record.category, record.category_name],
      "Products",
    ),
    price,
    cost: toNumber(
      firstDefined([record.cost, record.costPrice, record.unit_cost]),
      price,
    ),
    stock,
    image: firstNonEmptyString(
      [record.product_image, record.image, record.photo, record.image_1920],
      "",
    ),
    description: firstNonEmptyString([record.description, record.details], ""),
    tax,
    createdAt: new Date(),
  };
}

function mapService(record: Record<string, unknown>): Service {
  const rawId = String(
    firstDefined([
      record.id,
      record.service_id,
      record.item_id,
      record.item_sold_service,
      record.name,
      record.service_name,
    ]) ?? "",
  );
  const name = firstNonEmptyString(
    [record.name, record.service_name, record.item_name],
    "Unnamed Service",
  );
  const id = rawId || name;
  return {
    id,
    name,
    price: toNumber(
      firstDefined([
        record.price,
        record.salePrice,
        record.unit_cost,
        record.amount,
        record.total_amount,
      ]),
    ),
    image: firstNonEmptyString(
      [record.service_image, record.image, record.photo, record.image_1920],
      "",
    ),
    tax: toNumber(firstDefined([record.tax, record.tax_rate, 0])),
    createdAt: new Date(),
  };
}

export class RemoteCatalogRepository implements CatalogRepository {
  private readonly pageSize = 100;

  private async getProductsPage(pageNo: number): Promise<Product[]> {
    console.info(`${LOG_PREFIX} getProductsPage request`, { pageNo });
    const records = await sendRequestModel("products.products", {
      fields: [
        "id",
        "name",
        "barcode",
        "quantityAtHand",
        "unitofMeasure",
        "costPrice",
        "salePrice",
        "product_image",
      ],
      search_filter: "",
      page_no: pageNo,
      limit: this.pageSize,
    });
    const mapped = records
      .filter(looksLikeProductRecord)
      .map(mapProduct)
      .filter((product) => product.id || product.name);
    console.info(`${LOG_PREFIX} getProductsPage result`, {
      pageNo,
      rawRecords: records.length,
      mappedProducts: mapped.length,
      mappedWithBarcode: mapped.filter((product) =>
        Boolean(product.barcode?.trim()),
      ).length,
      sample: mapped[0]
        ? {
            id: mapped[0].id,
            name: mapped[0].name,
            barcode: mapped[0].barcode,
            sku: mapped[0].sku,
            stock: mapped[0].stock,
            price: mapped[0].price,
          }
        : null,
    });

    return mapped;
  }

  private async getServicesPage(pageNo: number): Promise<Service[]> {
    console.info(`${LOG_PREFIX} getServicesPage request`, { pageNo });
    const records = await sendRequestModel("services.services", {
      fields: ["id", "name", "salePrice", "service_image"],
      search_filter: "",
      page_no: pageNo,
      limit: this.pageSize,
    });
    const mapped = records
      .filter(looksLikeServiceRecord)
      .map(mapService)
      .filter((service) => service.id || service.name);
    console.info(`${LOG_PREFIX} getServicesPage result`, {
      pageNo,
      rawRecords: records.length,
      mappedServices: mapped.length,
      sample: mapped[0]
        ? {
            id: mapped[0].id,
            name: mapped[0].name,
            price: mapped[0].price,
          }
        : null,
    });

    return mapped;
  }

  async getProducts(): Promise<Product[]> {
    const products: Product[] = [];
    let pageNo = 1;

    while (true) {
      const page = await this.getProductsPage(pageNo);
      products.push(...page);

      if (page.length < this.pageSize) {
        break;
      }

      pageNo += 1;
    }

    console.info(`${LOG_PREFIX} getProducts complete`, {
      totalProducts: products.length,
      pagesFetched: pageNo,
    });

    return products;
  }

  async searchProducts(query: string): Promise<Product[]> {
    const products = await this.getProducts();
    const needle = query.trim().toLowerCase();
    if (!needle) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        (product.barcode ?? "").toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle) ||
        product.category.toLowerCase().includes(needle),
    );
  }

  async getServices(): Promise<Service[]> {
    const services: Service[] = [];
    let pageNo = 1;

    while (true) {
      const page = await this.getServicesPage(pageNo);
      services.push(...page);

      if (page.length < this.pageSize) {
        break;
      }

      pageNo += 1;
    }

    console.info(`${LOG_PREFIX} getServices complete`, {
      totalServices: services.length,
      pagesFetched: pageNo,
    });

    return services;
  }
}
