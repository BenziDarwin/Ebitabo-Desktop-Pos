import type { Client, Product } from "./catalog";

export interface CartItem {
  id: string;
  productId?: string;
  serviceId?: string;
  name: string;
  quantity: number;
  price: number;
  tax: number;
  subtotal: number;
}

export interface Payment {
  method: "cash" | "card" | "check" | "transfer";
  amount: number;
}

export interface OrderDraft {
  id: string;
  items: CartItem[];
  client?: Client;
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  discountType: "amount" | "percent";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface CompletedOrder extends OrderDraft {
  payments: Payment[];
  change: number;
  completedAt: Date;
  receipt?: string;
}

export interface SalesSummary {
  totalOrders: number;
  totalSales: number;
  totalTax: number;
  totalDiscount: number;
}

export type TopProduct = Product & ProductSalesCount;

export interface ProductSalesCount {
  sold: number;
}

export interface Store {
  name: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
}
