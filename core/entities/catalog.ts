export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
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
  image?: string;
  tax: number;
  createdAt: Date;
}

export interface Client {
  id: string;
  name: string;
  advancedAmount?: number;
  email?: string;
  phone?: string;
  address?: string;
  createdAt: Date;
}
