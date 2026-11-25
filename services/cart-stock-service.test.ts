import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "@/core/entities";
import {
  deductLocalProductStock,
  restoreLocalProductStock,
} from "@/services/cart-stock-service";
import {
  readLocalProducts,
  writeLocalProducts,
} from "@/services/repositories/local-catalog-storage";
import { LocalOrderRepository } from "@/services/repositories/local-order-repository";

describe("cart-stock-service stock adjustments", () => {
  const sampleProducts: Product[] = [
    {
      id: "prod-1",
      name: "Water Bottle",
      price: 1000,
      stock: 10,
      createdAt: new Date(),
    },
    {
      id: "prod-2",
      name: "Soap",
      price: 2000,
      stock: 5,
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    writeLocalProducts(sampleProducts);
  });

  it("deducts stock for given items", () => {
    deductLocalProductStock([
      { productId: "prod-1", quantity: 3 },
      { productId: "prod-2", quantity: 2 },
    ]);

    const updated = readLocalProducts();
    const p1 = updated.find((p) => p.id === "prod-1");
    const p2 = updated.find((p) => p.id === "prod-2");

    expect(p1?.stock).toBe(7);
    expect(p2?.stock).toBe(3);
  });

  it("restores stock for given items when order is cancelled", () => {
    // First deduct
    deductLocalProductStock([{ productId: "prod-1", quantity: 4 }]);
    expect(readLocalProducts().find((p) => p.id === "prod-1")?.stock).toBe(6);

    // Cancel order -> restore stock
    restoreLocalProductStock([{ productId: "prod-1", quantity: 4 }]);
    expect(readLocalProducts().find((p) => p.id === "prod-1")?.stock).toBe(10);
  });

  it("does not deduct below zero", () => {
    deductLocalProductStock([{ productId: "prod-2", quantity: 10 }]);
    const p2 = readLocalProducts().find((p) => p.id === "prod-2");
    expect(p2?.stock).toBe(0);
  });
});

describe("LocalOrderRepository completeOrder skipStockDeduction", () => {
  const sampleProducts: Product[] = [
    {
      id: "prod-1",
      name: "Water Bottle",
      price: 1000,
      stock: 10,
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    writeLocalProducts(sampleProducts);
  });

  it("skips stock deduction when skipStockDeduction is true", async () => {
    const repo = new LocalOrderRepository();
    await repo.completeOrder(
      {
        id: "order-1",
        items: [
          {
            id: "ci-1",
            productId: "prod-1",
            name: "Water Bottle",
            price: 1000,
            quantity: 3,
            subtotal: 3000,
          },
        ],
        subtotal: 3000,
        total: 3000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      "user-1",
      { skipStockDeduction: true },
    );

    const products = readLocalProducts();
    expect(products.find((p) => p.id === "prod-1")?.stock).toBe(10);
  });

  it("deducts stock when skipStockDeduction is false or omitted", async () => {
    const repo = new LocalOrderRepository();
    await repo.completeOrder(
      {
        id: "order-2",
        items: [
          {
            id: "ci-2",
            productId: "prod-1",
            name: "Water Bottle",
            price: 1000,
            quantity: 3,
            subtotal: 3000,
          },
        ],
        subtotal: 3000,
        total: 3000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      "user-1",
    );

    const products = readLocalProducts();
    expect(products.find((p) => p.id === "prod-1")?.stock).toBe(7);
  });
});
