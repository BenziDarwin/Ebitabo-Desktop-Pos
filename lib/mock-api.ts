import type {
  User,
  Product,
  Service,
  Client,
  OrderDraft,
  CompletedOrder,
  CartItem,
} from "./types";
import {
  mockUsers,
  mockProducts,
  mockServices,
  mockClients,
  mockCompletedOrders,
} from "./mock-data";

// Simulate API delay
const delay = (ms: number = 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// User Management
export async function authenticateUser(
  url: string,
  username: string,
  password: string,
): Promise<User | null> {
  await delay();
  const user = mockUsers.find(
    (u) => u.url === url && u.username === username && u.password === password,
  );
  return user || null;
}

export async function getUsers(): Promise<User[]> {
  await delay();
  return [...mockUsers];
}

export async function getUserById(id: string): Promise<User | null> {
  await delay();
  return mockUsers.find((u) => u.id === id) || null;
}

// Products
export async function getProducts(): Promise<Product[]> {
  await delay();
  return [...mockProducts];
}

export async function getProductsByCategory(
  category: string,
): Promise<Product[]> {
  await delay();
  return mockProducts.filter((p) => p.category === category);
}

export async function getProductById(id: string): Promise<Product | null> {
  await delay();
  return mockProducts.find((p) => p.id === id) || null;
}

export async function searchProducts(query: string): Promise<Product[]> {
  await delay();
  const lower = query.toLowerCase();
  return mockProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower),
  );
}

// Services
export async function getServices(): Promise<Service[]> {
  await delay();
  return [...mockServices];
}

// Clients
export async function getClients(): Promise<Client[]> {
  await delay();
  return [...mockClients];
}

export async function getClientById(id: string): Promise<Client | null> {
  await delay();
  return mockClients.find((c) => c.id === id) || null;
}

export async function searchClients(query: string): Promise<Client[]> {
  await delay();
  const lower = query.toLowerCase();
  return mockClients.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      c.email?.toLowerCase().includes(lower) ||
      c.phone?.includes(query),
  );
}

// Completed Orders
export async function getCompletedOrders(): Promise<CompletedOrder[]> {
  await delay();
  return [...mockCompletedOrders];
}

export async function getCompletedOrdersByUser(
  userId: string,
): Promise<CompletedOrder[]> {
  await delay();
  return mockCompletedOrders.filter((o) => o.userId === userId);
}

export async function getCompletedOrderById(
  id: string,
): Promise<CompletedOrder | null> {
  await delay();
  return mockCompletedOrders.find((o) => o.id === id) || null;
}

export async function completeOrder(
  order: OrderDraft,
  userId: string,
): Promise<CompletedOrder> {
  await delay();

  const completedOrder: CompletedOrder = {
    ...order,
    userId,
    payments: [],
    change: 0,
    completedAt: new Date(),
  };

  mockCompletedOrders.push(completedOrder);
  return completedOrder;
}

// Summary/Dashboard data
export async function getTodaySalesData(userId?: string) {
  await delay();
  const orders = userId
    ? mockCompletedOrders.filter((o) => o.userId === userId)
    : mockCompletedOrders;

  const now = new Date();
  const todayOrders = orders.filter((o) => {
    const orderDate = new Date(o.completedAt);
    return (
      orderDate.getDate() === now.getDate() &&
      orderDate.getMonth() === now.getMonth() &&
      orderDate.getFullYear() === now.getFullYear()
    );
  });

  return {
    totalOrders: todayOrders.length,
    totalSales: todayOrders.reduce((sum, o) => sum + o.total, 0),
    totalTax: todayOrders.reduce((sum, o) => sum + o.tax, 0),
    totalDiscount: todayOrders.reduce((sum, o) => sum + o.discount, 0),
  };
}

export async function getTopProducts(): Promise<
  (Product & { sold: number })[]
> {
  await delay();
  const salesMap: Record<string, { product: Product; sold: number }> = {};

  for (const order of mockCompletedOrders) {
    for (const item of order.items) {
      if (item.productId) {
        if (!salesMap[item.productId]) {
          const product = mockProducts.find((p) => p.id === item.productId);
          if (product) {
            salesMap[item.productId] = { product, sold: 0 };
          }
        }
        if (salesMap[item.productId]) {
          salesMap[item.productId].sold += item.quantity;
        }
      }
    }
  }

  return Object.values(salesMap)
    .map((item) => ({ ...item.product, sold: item.sold }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 10);
}

export async function getOrderHistory(limit = 20): Promise<CompletedOrder[]> {
  await delay();
  return mockCompletedOrders.slice(-limit).reverse();
}
