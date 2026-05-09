export interface User {
  id: string;
  name: string;
  username: string;
  url?: string;
  email: string;
  pin: string;
  password: string;
  role: "cashier" | "manager" | "admin";
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost?: number;
  stock: number;
  image?: string;
  description?: string;
  tax: number;
  createdAt: Date;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  tax: number;
  createdAt: Date;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt: Date;
}

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

export interface Store {
  name: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
}
