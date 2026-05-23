"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/provider/auth-provider";
import { formatCurrency } from "@/lib/format-currency";
import { formatQuantity } from "@/lib/quantity";
import { POSLayout } from "@/components/pos-layout";
import { Button } from "@/components/ui/button";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import { getOrderHistory } from "@/services/history-service";
import {
  getSalesRecordByUserId,
  type DailySalesRecord,
} from "@/services/history-reports-service";
import { syncPendingTransactions } from "@/services/transaction-sync-service";
import {
  isSubscriptionExpired,
  SUBSCRIPTION_EXPIRED_MESSAGE,
} from "@/lib/subscription";
import { resolveBusinessForSale } from "@/lib/sale-context";
import type { CompletedOrder } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  DollarSign,
  ShoppingCart,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type TimeFilter = "today" | "week" | "month" | "all";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function filterOrdersByTime(
  orders: CompletedOrder[],
  filter: TimeFilter,
): CompletedOrder[] {
  const today = startOfToday();
  return orders.filter((order) => {
    const completedAt = new Date(order.completedAt);
    switch (filter) {
      case "today":
        return completedAt >= today;
      case "week": {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return completedAt >= weekAgo;
      }
      case "month": {
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return completedAt >= monthAgo;
      }
      default:
        return true;
    }
  });
}

function filterDailySalesByTime(
  salesData: DailySalesRecord[],
  filter: TimeFilter,
): DailySalesRecord[] {
  const today = startOfToday();
  return salesData.filter((sale) => {
    const saleDate = new Date(sale.date_sale);
    if (Number.isNaN(saleDate.getTime())) return false;

    switch (filter) {
      case "today":
        return saleDate >= today;
      case "week": {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return saleDate >= weekAgo;
      }
      case "month": {
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return saleDate >= monthAgo;
      }
      default:
        return true;
    }
  });
}

function getOrderPaidAmount(order: CompletedOrder): number {
  const fromSync = Number(order.sync?.amountPaid);
  if (Number.isFinite(fromSync) && fromSync >= 0) {
    return fromSync;
  }

  const firstPayment = Number(order.payments?.[0]?.amount);
  if (Number.isFinite(firstPayment) && firstPayment >= 0) {
    return firstPayment;
  }

  const fallback = Number(order.total);
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

function toDateKey(rawDate: string | Date): string {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
}

function toDailySalesFromLocalOrders(
  orders: CompletedOrder[],
): DailySalesRecord[] {
  const dailyTotals = new Map<string, number>();

  for (const order of orders) {
    const dayKey = toDateKey(order.completedAt);
    if (!dayKey) continue;
    dailyTotals.set(
      dayKey,
      (dailyTotals.get(dayKey) ?? 0) + getOrderPaidAmount(order),
    );
  }

  return Array.from(dailyTotals.entries()).map(
    ([date_sale, sum_amount_sale]) => ({
      date_sale,
      sum_amount_sale,
    }),
  );
}

function mergeDailySales(
  base: DailySalesRecord[],
  overlay: DailySalesRecord[],
): DailySalesRecord[] {
  const totals = new Map<string, number>();

  for (const row of base) {
    const key = toDateKey(row.date_sale);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + row.sum_amount_sale);
  }

  for (const row of overlay) {
    const key = toDateKey(row.date_sale);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + row.sum_amount_sale);
  }

  return Array.from(totals.entries())
    .map(([date_sale, sum_amount_sale]) => ({ date_sale, sum_amount_sale }))
    .sort(
      (a, b) =>
        new Date(a.date_sale).getTime() - new Date(b.date_sale).getTime(),
    );
}

function buildChartData(salesData: DailySalesRecord[]) {
  return salesData.map((entry) => ({
    date: new Date(entry.date_sale).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    amount: entry.sum_amount_sale,
    count: 1,
  }));
}

function buildTopProducts(orders: CompletedOrder[]) {
  const itemsByProductId = new Map<
    string,
    { id: string; name: string; sold: number }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      const itemId = item.productId ?? item.serviceId ?? item.id;
      const key = String(itemId);
      const existing = itemsByProductId.get(key);

      if (existing) {
        existing.sold += item.quantity;
        continue;
      }

      itemsByProductId.set(key, {
        id: key,
        name: item.name,
        sold: item.quantity,
      });
    }
  }

  return Array.from(itemsByProductId.values())
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 10);
}

export default function HistoryPage() {
  const { user, business, currency, fetchBusinessDetails } = useAuth();
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [remoteDailySales, setRemoteDailySales] = useState<DailySalesRecord[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("month");
  const [selectedOrder, setSelectedOrder] = useState<CompletedOrder | null>(
    null,
  );
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const hasAutoSyncedOnEntry = useRef(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const ordersData = await getOrderHistory(500);
      const dailySalesData = await getSalesRecordByUserId(
        user?.id ?? business?.userId,
      );
      const filteredByUser = user?.id
        ? ordersData.filter((order) => order.userId === user.id)
        : ordersData;
      setOrders(filteredByUser);
      setRemoteDailySales(dailySalesData);
    } finally {
      setIsLoading(false);
    }
  }, [business?.userId, user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const filteredOrders = useMemo(
    () => filterOrdersByTime(orders, timeFilter),
    [orders, timeFilter],
  );

  const filteredRemoteDailySales = useMemo(
    () => filterDailySalesByTime(remoteDailySales, timeFilter),
    [remoteDailySales, timeFilter],
  );
  const pendingOrdersInRange = useMemo(
    () => filteredOrders.filter((order) => order.sync.status === "pending"),
    [filteredOrders],
  );

  const localDailySales = useMemo(
    () => toDailySalesFromLocalOrders(filteredOrders),
    [filteredOrders],
  );
  const pendingDailySales = useMemo(
    () => toDailySalesFromLocalOrders(pendingOrdersInRange),
    [pendingOrdersInRange],
  );

  // Borrowed from mobile dashboard idea: use backend daily-sales endpoint as primary chart source.
  // We overlay local pending totals so offline-created data is visible before sync.
  const displayedDailySales = useMemo(() => {
    if (filteredRemoteDailySales.length === 0) {
      return localDailySales;
    }
    return mergeDailySales(filteredRemoteDailySales, pendingDailySales);
  }, [filteredRemoteDailySales, localDailySales, pendingDailySales]);

  const chartData = useMemo(
    () => buildChartData(displayedDailySales),
    [displayedDailySales],
  );
  const topProducts = useMemo(
    () => buildTopProducts(filteredOrders),
    [filteredOrders],
  );

  const pendingOrders = useMemo(
    () => orders.filter((order) => order.sync.status === "pending"),
    [orders],
  );
  const pendingCount = pendingOrders.length;
  const pendingAmount = pendingOrders.reduce(
    (sum, order) => sum + getOrderPaidAmount(order),
    0,
  );

  const summary = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalSales = displayedDailySales.reduce(
      (sum, sale) => sum + sale.sum_amount_sale,
      0,
    );
    const totalTax = filteredOrders.reduce((sum, order) => sum + order.tax, 0);
    const totalDiscount = filteredOrders.reduce(
      (sum, order) => sum + order.discount,
      0,
    );
    const syncedOrders = filteredOrders.filter(
      (order) => order.sync.status === "synced",
    ).length;

    return {
      totalOrders,
      totalSales,
      totalTax,
      totalDiscount,
      syncedOrders,
    };
  }, [displayedDailySales, filteredOrders]);

  const runPendingSync = useCallback(
    async (showToasts: boolean) => {
      if (isSyncingPending) return;

      const resolvedBusiness = await resolveBusinessForSale({
        currentBusiness: business,
        refreshBusinessDetails: fetchBusinessDetails,
      });

      if (isSubscriptionExpired(resolvedBusiness?.dateExpiry)) {
        if (showToasts) {
          toast.error(SUBSCRIPTION_EXPIRED_MESSAGE);
        }
        return;
      }
      if (pendingCount === 0) {
        if (showToasts) {
          toast.info("No pending transactions to sync.");
        }
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (showToasts) {
          toast.error("You are offline. Reconnect and try syncing again.");
        }
        return;
      }

      setIsSyncingPending(true);
      try {
        const result = await syncPendingTransactions({
          business: resolvedBusiness ?? business,
          createdBy: user?.name || user?.username,
        });
        await loadData();

        if (!showToasts) {
          return;
        }

        if (result.attempted === 0) {
          toast.info("No pending transactions were found.");
        } else if (result.failed === 0) {
          toast.success(
            `Synced ${result.synced} pending transaction${result.synced === 1 ? "" : "s"}.`,
          );
        } else if (result.synced > 0) {
          toast.warning(
            `Synced ${result.synced}, but ${result.failed} transaction${result.failed === 1 ? "" : "s"} still pending.`,
          );
        } else {
          toast.error(
            "Could not sync pending transactions. Check network/API.",
          );
        }
      } catch (error) {
        console.error("Failed to sync pending transactions", error);
        if (showToasts) {
          toast.error("Failed to sync pending transactions.");
        }
      } finally {
        setIsSyncingPending(false);
      }
    },
    [
      business,
      fetchBusinessDetails,
      isSyncingPending,
      loadData,
      pendingCount,
      user,
    ],
  );

  const handleSyncPending = () => {
    void runPendingSync(true);
  };

  useEffect(() => {
    if (isLoading || hasAutoSyncedOnEntry.current) return;
    hasAutoSyncedOnEntry.current = true;
    void runPendingSync(false);
  }, [isLoading, runPendingSync]);

  if (isLoading) {
    return (
      <POSLayout currentPage="history">
        <div className="max-w-7xl mx-auto p-6">
          <p className="text-slate-500">Loading...</p>
        </div>
      </POSLayout>
    );
  }

  return (
    <POSLayout currentPage="history">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Sales History</h1>
            <p className="text-slate-600 mt-1">
              Offline-first transactions with pending and synced states
            </p>
          </div>
          <Button
            onClick={handleSyncPending}
            disabled={isSyncingPending || pendingCount === 0}
            variant="outline"
            className="w-full lg:w-auto"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isSyncingPending ? "animate-spin" : ""}`}
            />
            {isSyncingPending ? "Syncing..." : `Sync Pending (${pendingCount})`}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={timeFilter === "today" ? "default" : "outline"}
            onClick={() => setTimeFilter("today")}
            size="sm"
          >
            Today
          </Button>
          <Button
            variant={timeFilter === "week" ? "default" : "outline"}
            onClick={() => setTimeFilter("week")}
            size="sm"
          >
            7 Days
          </Button>
          <Button
            variant={timeFilter === "month" ? "default" : "outline"}
            onClick={() => setTimeFilter("month")}
            size="sm"
          >
            30 Days
          </Button>
          <Button
            variant={timeFilter === "all" ? "default" : "outline"}
            onClick={() => setTimeFilter("all")}
            size="sm"
          >
            All Time
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">
                  Transactions
                </p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {summary.totalOrders}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Total Paid</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {formatCurrency(summary.totalSales, currency)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Synced</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {summary.syncedOrders}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Pending</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {pendingCount}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {formatCurrency(pendingAmount, currency)}
                </p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock3 className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Sales Trend
            </h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ fill: "#2563eb", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-center py-8">
                No sales data available
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Top Items</h3>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.slice(0, 5).map((product, index) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatQuantity(product.sold)} sold
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">
                No data available
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">
              Recent Transactions
            </h3>
            <div className="text-xs text-slate-500">
              Tax: {formatCurrency(summary.totalTax, currency)} | Discount:{" "}
              {formatCurrency(summary.totalDiscount, currency)}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500">No transactions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold text-slate-700 text-sm">
                      Order ID
                    </th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-700 text-sm">
                      Date & Time
                    </th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-700 text-sm">
                      Items
                    </th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-700 text-sm">
                      Customer
                    </th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-700 text-sm">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right font-semibold text-slate-700 text-sm">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => {
                    const isPending = order.sync.status === "pending";

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50 transition-all duration-200 group"
                      >
                        <td className="px-6 py-4 text-slate-900 font-semibold text-sm">
                          #{order.id.slice(-6)}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          {new Date(order.completedAt).toLocaleDateString()}{" "}
                          <span className="font-medium text-slate-700">
                            {new Date(order.completedAt).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          <Badge variant="secondary" className="rounded-md">
                            {order.items.length} item
                            {order.items.length !== 1 ? "s" : ""}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          {order.client?.name || "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          <Badge
                            className={
                              isPending
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                            }
                          >
                            {isPending ? "Pending" : "Synced"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-slate-900 text-lg">
                              {formatCurrency(
                                getOrderPaidAmount(order),
                                currency,
                              )}
                            </span>
                            <Button
                              onClick={() => {
                                setSelectedOrder(order);
                                setShowOrderDetails(true);
                              }}
                              variant="outline"
                              size="sm"
                              className="rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <OrderDetailsDialog
          open={showOrderDetails}
          order={selectedOrder}
          onClose={() => {
            setShowOrderDetails(false);
            setSelectedOrder(null);
          }}
          isCompletedOrder={true}
        />
      </div>
    </POSLayout>
  );
}
