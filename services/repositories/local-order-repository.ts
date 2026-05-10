import type { CompletedOrder, OrderDraft } from "@/core/entities";
import type { OrderRepository } from "@/core/repositories";
import {
  readLocalProducts,
  writeLocalProducts,
} from "@/services/repositories/local-catalog-storage";
import {
  readLocalSalesRecords,
  writeLocalSalesRecords,
} from "@/services/repositories/local-sales-storage";

function buildSoldQuantities(order: OrderDraft): Map<string, number> {
  const soldByProductId = new Map<string, number>();

  for (const item of order.items) {
    if (!item.productId) continue;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;
    soldByProductId.set(
      item.productId,
      (soldByProductId.get(item.productId) ?? 0) + quantity,
    );
  }

  return soldByProductId;
}

export class LocalOrderRepository implements OrderRepository {
  async completeOrder(
    order: OrderDraft,
    userId: string,
  ): Promise<CompletedOrder> {
    const completedOrder: CompletedOrder = {
      ...order,
      items: order.items.map((item) => ({ ...item })),
      client: order.client ? { ...order.client } : undefined,
      userId,
      payments: [],
      change: 0,
      completedAt: new Date(),
    };

    const records = readLocalSalesRecords();
    records.push(completedOrder);
    writeLocalSalesRecords(records);

    const soldByProductId = buildSoldQuantities(order);
    if (soldByProductId.size > 0) {
      const products = readLocalProducts();
      const updatedProducts = products.map((product) => {
        const soldQty = soldByProductId.get(product.id);
        if (!soldQty) return product;

        return {
          ...product,
          stock: Math.max(0, product.stock - soldQty),
        };
      });
      writeLocalProducts(updatedProducts);
    }

    return completedOrder;
  }
}
