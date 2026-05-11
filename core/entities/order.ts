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

export type SalePaymentMethod =
  | "Cash"
  | "Mobile Money"
  | "Bank Transfer"
  | "Debit/Credit Card"
  | "Advance";

export interface Payment {
  method: SalePaymentMethod;
  amount: number;
  date?: string;
}

export type SaleSyncStatus = "pending" | "synced";

export interface SaleSyncMetadata {
  status: SaleSyncStatus;
  remoteSaleId: number | null;
  syncedAt: Date | null;
  lastSyncError: string | null;
  paymentMethod: SalePaymentMethod;
  amountPaid: number;
  currencyId: number;
  businessAccountType?: string | null;
  businessUserId: string;
  createdBy?: string;
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
  sync: SaleSyncMetadata;
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
