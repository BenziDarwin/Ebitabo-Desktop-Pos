"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/provider/auth-provider";
import { formatCurrency } from "@/lib/format-currency";
import { POSLayout } from "@/components/pos-layout";
import { Button } from "@/components/ui/button";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import {
  getTodaySalesData,
  getTopProducts,
  getOrderHistory,
} from "@/services/history-service";
import type { CompletedOrder, Product, OrderDraft } from "@/lib/types";
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
import { TrendingUp, DollarSign, ShoppingCart, Users, Eye } from "lucide-react";

interface SalesData {
  totalOrders: number;
  totalSales: number;
  totalTax: number;
  totalDiscount: number;
}

export default function HistoryPage() {
  const { user, currency } = useAuth();
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [topProducts, setTopProducts] = useState<
    (Product & { sold: number })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<CompletedOrder | null>(
    null,
  );
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [ordersData, todaySales, topProds] = await Promise.all([
        getOrderHistory(),
        getTodaySalesData(user?.id),
        getTopProducts(),
      ]);
      setOrders(ordersData);
      setSalesData(todaySales);
      setTopProducts(topProds);
      setIsLoading(false);
    };
    loadData();
  }, [user?.id]);

  const chartData = orders
    .slice()
    .reverse()
    .map((order) => ({
      date: new Date(order.completedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      amount: order.total,
      count: 1,
    }))
    .reduce(
      (acc, curr) => {
        const existing = acc.find((item) => item.date === curr.date);
        if (existing) {
          existing.amount += curr.amount;
          existing.count += curr.count;
        } else {
          acc.push(curr);
        }
        return acc;
      },
      [] as Array<{ date: string; amount: number; count: number }>,
    );

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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Sales History</h1>
          <p className="text-slate-600 mt-1">Track your sales performance</p>
        </div>

        {/* KPI Cards */}
        {salesData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Orders */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">
                    Total Orders
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">
                    {salesData.totalOrders}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Total Sales */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">
                    Total Sales
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">
                    {formatCurrency(salesData.totalSales, currency)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            {/* Total Tax */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">
                    Total Tax
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">
                    {formatCurrency(salesData.totalTax, currency)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>

            {/* Total Discount */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">
                    Discounts Given
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">
                    {formatCurrency(salesData.totalDiscount, currency)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Trend */}
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

          {/* Top Products */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Top Products
            </h3>
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
                        {product.sold} sold
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

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Recent Orders</h3>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500">No orders found</p>
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
                    <th className="px-6 py-4 text-right font-semibold text-slate-700 text-sm">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
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
                          {new Date(order.completedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        <Badge variant="secondary" className="rounded-md">
                          {order.items.length} item
                          {order.items.length !== 1 ? "s" : ""}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {order.client?.name || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-slate-900 text-lg">
                            {formatCurrency(order.total, currency)}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order Details Dialog */}
        <OrderDetailsDialog
          open={showOrderDetails}
          order={selectedOrder as OrderDraft | null}
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
