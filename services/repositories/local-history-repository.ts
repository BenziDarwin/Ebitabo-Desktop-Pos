import type {
  CompletedOrder,
  Product,
  SalesSummary,
  TopProduct,
} from "@/core/entities";
import type { HistoryRepository } from "@/core/repositories";
import { readLocalSalesRecords } from "@/services/repositories/local-sales-storage";
import { sendRequestModel } from "@/services/repositories/send-request";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

function cloneCompletedOrder(order: CompletedOrder): CompletedOrder {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
    payments: order.payments.map((payment) => ({ ...payment })),
    client: order.client ? { ...order.client } : undefined,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    completedAt: new Date(order.completedAt),
  };
}

function buildSummary(orders: CompletedOrder[]): SalesSummary {
  return {
    totalOrders: orders.length,
    totalSales: orders.reduce((sum, order) => sum + order.total, 0),
    totalTax: orders.reduce((sum, order) => sum + order.tax, 0),
    totalDiscount: orders.reduce((sum, order) => sum + order.discount, 0),
  };
}

function todayOnly(orders: CompletedOrder[]): CompletedOrder[] {
  const now = new Date();
  return orders.filter((order) => {
    const date = new Date(order.completedAt);
    return (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  });
}

export class LocalHistoryRepository implements HistoryRepository {
  async getCompletedOrders(): Promise<CompletedOrder[]> {
    return readLocalSalesRecords().map(cloneCompletedOrder);
  }

  async getOrderHistory(limit = 20): Promise<CompletedOrder[]> {
    return readLocalSalesRecords()
      .slice(-limit)
      .reverse()
      .map(cloneCompletedOrder);
  }

  async getTodaySalesData(userId?: string): Promise<SalesSummary> {
    const localOrders = readLocalSalesRecords();
    const filteredLocal = userId
      ? localOrders.filter((order) => order.userId === userId)
      : localOrders;

    const localSummary = buildSummary(todayOnly(filteredLocal));
    if (localSummary.totalOrders > 0) {
      return localSummary;
    }

    const storedUserId = userId ?? Storage.getItem(STORAGE_KEYS.userId) ?? "";
    if (!storedUserId) {
      return localSummary;
    }

    const records = await sendRequestModel(
      "business_reports.business_summary_userreport",
      {
        fields: ["id", "total_sales", "tax", "discount", "order_count"],
        function: "get_daily_sales",
      },
      { query: `user_id=${encodeURIComponent(storedUserId)}` },
    );

    if (records.length === 0) {
      return localSummary;
    }

    const first = records[0];
    return {
      totalOrders: Number(first.order_count ?? first.total_orders ?? 0),
      totalSales: Number(first.total_sales ?? first.total ?? 0),
      totalTax: Number(first.tax ?? first.total_tax ?? 0),
      totalDiscount: Number(first.discount ?? first.total_discount ?? 0),
    };
  }

  async getTopProducts(): Promise<TopProduct[]> {
    const localOrders = readLocalSalesRecords();
    const salesMap: Record<string, { product: Product; sold: number }> = {};

    for (const order of localOrders) {
      for (const item of order.items) {
        if (!item.productId) {
          continue;
        }

        if (!salesMap[item.productId]) {
          salesMap[item.productId] = {
            product: {
              id: item.productId,
              name: item.name,
              sku: item.productId,
              category: "Products",
              price: item.price,
              stock: 0,
              tax: item.tax,
              createdAt: new Date(order.completedAt),
            },
            sold: 0,
          };
        }

        salesMap[item.productId].sold += item.quantity;
      }
    }

    return Object.values(salesMap)
      .map((entry) => ({ ...entry.product, sold: entry.sold }))
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 10);
  }
}
