import type { CartItem } from "@/core/entities";
import { readLocalProducts } from "@/services/repositories/local-catalog-storage";

export interface InsufficientStockIssue {
  itemName: string;
  requested: number;
  available: number;
}

function toWholeUnits(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export function getLocalProductStockMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const product of readLocalProducts()) {
    map.set(
      String(product.id),
      Math.max(0, Math.floor(Number(product.stock) || 0)),
    );
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
  return Math.max(0, toWholeUnits(available));
}

export function clampCartItemQuantityToStock(
  cartItem: CartItem,
  requestedQuantity: number,
  stockByProductId: Map<string, number>,
): number {
  const normalizedRequested = toWholeUnits(requestedQuantity);
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
    const requested = toWholeUnits(item.quantity);
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
