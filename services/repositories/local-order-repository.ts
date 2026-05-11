import type { CompletedOrder, OrderDraft } from "@/core/entities";
import type {
  CompleteOrderOptions,
  OrderRepository,
} from "@/core/repositories";
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
    options?: CompleteOrderOptions,
  ): Promise<CompletedOrder> {
    const syncStatus = options?.sync?.status ?? "synced";
    const syncAmountPaid = Number(options?.sync?.amountPaid ?? order.total);
    const fallbackAmountPaid =
      Number.isFinite(syncAmountPaid) && syncAmountPaid >= 0
        ? syncAmountPaid
        : order.total;
    const resolvedSyncedAt =
      syncStatus === "synced"
        ? options?.sync?.syncedAt
          ? new Date(options.sync.syncedAt)
          : new Date()
        : null;
    const syncCurrencyId = Number(options?.sync?.currencyId ?? 0);
    const resolvedCurrencyId = Number.isFinite(syncCurrencyId)
      ? syncCurrencyId
      : 0;
    const resolvedPayments =
      options?.payments && options.payments.length > 0
        ? options.payments.map((payment) => ({ ...payment }))
        : [
            {
              method: options?.sync?.paymentMethod ?? "Cash",
              amount: fallbackAmountPaid,
              date: new Date().toISOString(),
            },
          ];
    const resolvedChange =
      typeof options?.change === "number"
        ? options.change
        : Math.max(0, fallbackAmountPaid - order.total);

    const completedOrder: CompletedOrder = {
      ...order,
      items: order.items.map((item) => ({ ...item })),
      client: order.client ? { ...order.client } : undefined,
      userId,
      payments: resolvedPayments,
      change: resolvedChange,
      completedAt: new Date(),
      sync: {
        status: syncStatus,
        remoteSaleId:
          typeof options?.sync?.remoteSaleId === "number"
            ? options.sync.remoteSaleId
            : null,
        syncedAt: resolvedSyncedAt,
        lastSyncError:
          options?.sync?.lastSyncError ??
          (syncStatus === "pending" ? "Pending sync" : null),
        paymentMethod: options?.sync?.paymentMethod ?? "Cash",
        amountPaid: fallbackAmountPaid,
        currencyId: resolvedCurrencyId,
        businessAccountType: options?.sync?.businessAccountType ?? null,
        businessUserId: String(options?.sync?.businessUserId ?? userId),
        createdBy: options?.sync?.createdBy,
      },
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
