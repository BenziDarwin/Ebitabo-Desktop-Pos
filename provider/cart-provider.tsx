"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { CartItem, Client } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import {
  clampCartItemQuantityToStock,
  getLocalProductStockMap,
} from "@/services/cart-stock-service";

interface CartContextType {
  cart: CartItem[];
  replaceCart: (items: CartItem[]) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItem: (itemId: string, quantity: number) => void;
  updateCartItemPrice: (itemId: string, price: number) => void;
  clearCart: () => void;
  cartSubtotal: number;
  cartTax: number;
  cartTotal: number;
  discount: number;
  discountType: "amount" | "percent";
  setDiscount: (amount: number, type: "amount" | "percent") => void;
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

interface SerializedCartState {
  cart: CartItem[];
  discount: number;
  discountType: "amount" | "percent";
  selectedClient: (Omit<Client, "createdAt"> & { createdAt: string }) | null;
  orderNotes: string;
}

interface RestoredCartState {
  cart: CartItem[];
  discount: number;
  discountType: "amount" | "percent";
  selectedClient: Client | null;
  orderNotes: string;
}

function restoreCartState(): RestoredCartState {
  const fallback: RestoredCartState = {
    cart: [],
    discount: 0,
    discountType: "amount",
    selectedClient: null,
    orderNotes: "",
  };

  const raw = Storage.getJson<SerializedCartState | null>(
    STORAGE_KEYS.cartState,
    null,
  );
  if (!raw) return fallback;

  const restoredClient = raw.selectedClient
    ? {
        ...raw.selectedClient,
        createdAt: new Date(raw.selectedClient.createdAt),
      }
    : null;

  return {
    cart: Array.isArray(raw.cart) ? raw.cart : [],
    discount: Number.isFinite(raw.discount) ? raw.discount : 0,
    discountType: raw.discountType === "percent" ? "percent" : "amount",
    selectedClient: restoredClient,
    orderNotes: typeof raw.orderNotes === "string" ? raw.orderNotes : "",
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [restoredState] = useState<RestoredCartState>(() => restoreCartState());
  const [cart, setCart] = useState<CartItem[]>(restoredState.cart);
  const [discount, setDiscountState] = useState(restoredState.discount);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    restoredState.discountType,
  );
  const [selectedClient, setSelectedClient] = useState<Client | null>(
    restoredState.selectedClient,
  );
  const [orderNotes, setOrderNotes] = useState(restoredState.orderNotes);

  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartTax = cart.reduce((sum, item) => sum + item.subtotal * item.tax, 0);

  let cartTotal = cartSubtotal + cartTax;
  if (discountType === "amount") {
    cartTotal -= discount;
  } else {
    cartTotal -= cartTotal * (discount / 100);
  }

  const addToCart = (item: CartItem) => {
    const stockByProductId = getLocalProductStockMap();
    const normalizedQuantity = Math.max(
      1,
      Math.floor(Number(item.quantity) || 1),
    );
    const clampedQuantity = clampCartItemQuantityToStock(
      item,
      normalizedQuantity,
      stockByProductId,
    );
    const normalizedItem: CartItem = {
      ...item,
      quantity: clampedQuantity,
      subtotal: item.price * clampedQuantity,
    };

    setCart((prevCart) => {
      const existingItem = prevCart.find(
        (entry) => entry.id === normalizedItem.id,
      );
      if (!existingItem) {
        if (normalizedItem.quantity <= 0) {
          return prevCart;
        }
        return [
          ...prevCart,
          {
            ...normalizedItem,
            subtotal: normalizedItem.price * normalizedItem.quantity,
          },
        ];
      }

      const nextQuantity = clampCartItemQuantityToStock(
        existingItem,
        existingItem.quantity + normalizedItem.quantity,
        stockByProductId,
      );
      if (nextQuantity <= 0) {
        return prevCart.filter((entry) => entry.id !== normalizedItem.id);
      }
      return prevCart.map((entry) =>
        entry.id === normalizedItem.id
          ? {
              ...entry,
              quantity: nextQuantity,
              subtotal: nextQuantity * entry.price,
            }
          : entry,
      );
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((entry) => entry.id !== itemId));
  };

  const updateCartItem = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    const stockByProductId = getLocalProductStockMap();
    const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));

    setCart((prevCart) =>
      prevCart.map((entry) =>
        entry.id === itemId
          ? (() => {
              const clampedQuantity = clampCartItemQuantityToStock(
                entry,
                normalizedQuantity,
                stockByProductId,
              );
              return {
                ...entry,
                quantity: clampedQuantity,
                subtotal: clampedQuantity * entry.price,
              };
            })()
          : entry,
      ),
    );
  };

  const updateCartItemPrice = (itemId: string, price: number) => {
    const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
    setCart((prevCart) =>
      prevCart.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              price: safePrice,
              subtotal: entry.quantity * safePrice,
            }
          : entry,
      ),
    );
  };

  const setDiscount = (amount: number, type: "amount" | "percent") => {
    setDiscountState(amount);
    setDiscountType(type);
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0, "amount");
    setSelectedClient(null);
    setOrderNotes("");
  };

  const replaceCart = (items: CartItem[]) => {
    const stockByProductId = getLocalProductStockMap();
    const normalizedItems = items
      .map((item) => {
        const normalizedQuantity = clampCartItemQuantityToStock(
          item,
          Math.max(1, Math.floor(Number(item.quantity) || 1)),
          stockByProductId,
        );
        return {
          ...item,
          quantity: normalizedQuantity,
          subtotal: normalizedQuantity * item.price,
        };
      })
      .filter((item) => item.quantity > 0);
    setCart(normalizedItems);
  };

  useEffect(() => {
    const snapshot: SerializedCartState = {
      cart,
      discount,
      discountType,
      selectedClient: selectedClient
        ? {
            ...selectedClient,
            createdAt: selectedClient.createdAt.toISOString(),
          }
        : null,
      orderNotes,
    };

    const isEmptySession =
      snapshot.cart.length === 0 &&
      snapshot.discount === 0 &&
      snapshot.discountType === "amount" &&
      !snapshot.selectedClient &&
      !snapshot.orderNotes.trim();

    if (isEmptySession) {
      Storage.removeItem(STORAGE_KEYS.cartState);
      return;
    }

    Storage.setJson(STORAGE_KEYS.cartState, snapshot);
  }, [cart, discount, discountType, selectedClient, orderNotes]);

  return (
    <CartContext.Provider
      value={{
        cart,
        replaceCart,
        addToCart,
        removeFromCart,
        updateCartItem,
        updateCartItemPrice,
        clearCart,
        cartSubtotal,
        cartTax,
        cartTotal,
        discount,
        discountType,
        setDiscount,
        selectedClient,
        setSelectedClient,
        orderNotes,
        setOrderNotes,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
