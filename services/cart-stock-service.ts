import type { CartItem } from "@/core/entities";
import {
  formatQuantity,
  toNonNegativeQuantity,
  toPositiveQuantity,
} from "@/lib/quantity";
import {
  readLocalProducts,
  writeLocalProducts,
} from "@/services/repositories/local-catalog-storage";

export interface InsufficientStockIssue {
  itemName: string;
  requested: number;
  available: number;
}

export function getLocalProductStockMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const product of readLocalProducts()) {
    map.set(String(product.id), toNonNegativeQuantity(Number(product.stock)));
  }
  return map;
}

export function resolveMaxAllowedQuantity(
  cartItem: CartItem,
  stockByProductId: Map<string, number>,
): number | null {
  if (!cartItem.productId) return null;
  const available = stockByProductId.get(String(cartItem.productId));
  if (available === undefined) return null;
  return toNonNegativeQuantity(available);
}

export function clampCartItemQuantityToStock(
  cartItem: CartItem,
  requestedQuantity: number,
  stockByProductId: Map<string, number>,
): number {
  const normalizedRequested = toPositiveQuantity(requestedQuantity);
  const maxAllowed = resolveMaxAllowedQuantity(cartItem, stockByProductId);
  if (maxAllowed === null) return normalizedRequested;
  if (maxAllowed <= 0) return 0;
  return Math.min(normalizedRequested, maxAllowed);
}

export function findFirstInsufficientStock(
  cartItems: CartItem[],
  stockByProductId: Map<string, number>,
): InsufficientStockIssue | null {
  for (const item of cartItems) {
    if (!item.productId) continue;
    const available = stockByProductId.get(String(item.productId));
    if (available === undefined) continue;
    const requested = toNonNegativeQuantity(item.quantity);
    if (requested <= 0) continue;
    if (requested > available) {
      return {
        itemName: item.name,
        requested,
        available,
      };
    }
  }
  return null;
}

export function formatStockQuantity(value: number, locale?: string): string {
  return formatQuantity(value, locale);
}

export function deductLocalProductStock(
  items: Array<{ productId?: string; quantity: number }>,
): void {
  const qtyByProductId = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const id = String(item.productId);
    qtyByProductId.set(id, (qtyByProductId.get(id) || 0) + qty);
  }

  if (qtyByProductId.size === 0) return;

  const products = readLocalProducts();
  const updated = products.map((product) => {
    const toDeduct = qtyByProductId.get(String(product.id));
    if (!toDeduct) return product;
    return {
      ...product,
      stock: Math.max(0, Number(product.stock || 0) - toDeduct),
    };
  });
  writeLocalProducts(updated);
}

export function restoreLocalProductStock(
  items: Array<{ productId?: string; quantity: number }>,
): void {
  const qtyByProductId = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const id = String(item.productId);
    qtyByProductId.set(id, (qtyByProductId.get(id) || 0) + qty);
  }

  if (qtyByProductId.size === 0) return;

  const products = readLocalProducts();
  const updated = products.map((product) => {
    const toRestore = qtyByProductId.get(String(product.id));
    if (!toRestore) return product;
    return {
      ...product,
      stock: Math.max(0, Number(product.stock || 0) + toRestore),
    };
  });
  writeLocalProducts(updated);
}
