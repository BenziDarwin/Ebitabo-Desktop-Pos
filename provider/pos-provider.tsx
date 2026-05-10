"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { CartItem, Client, OrderDraft } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import { useCart } from "@/provider/cart-provider";

interface POSContextType {
  cart: CartItem[];
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
  orderDrafts: OrderDraft[];
  activeDraftId: string | null;
  saveOrderDraft: (draft: OrderDraft) => void;
  loadOrderDraft: (draftId: string) => void;
  deleteOrderDraft: (draftId: string) => void;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

function hydrateDrafts(rawDrafts: OrderDraft[]): OrderDraft[] {
  return rawDrafts.map((draft) => ({
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
    client: draft.client
      ? {
          ...draft.client,
          createdAt: new Date(draft.client.createdAt),
        }
      : undefined,
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt),
  }));
}

function restoreDraftState() {
  const savedDrafts = Storage.getJson<OrderDraft[]>(
    STORAGE_KEYS.orderDrafts,
    [],
  );
  const drafts = hydrateDrafts(savedDrafts);
  const savedActiveDraftId = Storage.getItem(STORAGE_KEYS.activeOrderDraftId);
  const activeDraftId =
    savedActiveDraftId &&
    drafts.some((draft) => draft.id === savedActiveDraftId)
      ? savedActiveDraftId
      : null;

  return { drafts, activeDraftId };
}

export function POSProvider({ children }: { children: React.ReactNode }) {
  const [restoredDraftState] = useState(() => restoreDraftState());
  const [orderDrafts, setOrderDrafts] = useState<OrderDraft[]>(
    restoredDraftState.drafts,
  );
  const [activeDraftId, setActiveDraftId] = useState<string | null>(
    restoredDraftState.activeDraftId,
  );
  const {
    cart,
    replaceCart,
    addToCart,
    removeFromCart,
    updateCartItem,
    updateCartItemPrice,
    clearCart: clearCartState,
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
  } = useCart();

  useEffect(() => {
    if (orderDrafts.length === 0) {
      Storage.removeItem(STORAGE_KEYS.orderDrafts);
      return;
    }
    Storage.setJson(STORAGE_KEYS.orderDrafts, orderDrafts);
  }, [orderDrafts]);

  useEffect(() => {
    if (!activeDraftId) {
      Storage.removeItem(STORAGE_KEYS.activeOrderDraftId);
      return;
    }
    Storage.setItem(STORAGE_KEYS.activeOrderDraftId, activeDraftId);
  }, [activeDraftId]);

  const saveOrderDraft = (draft: OrderDraft) => {
    setOrderDrafts((previousDrafts) => {
      const draftIndex = previousDrafts.findIndex(
        (existingDraft) => existingDraft.id === draft.id,
      );
      if (draftIndex === -1) {
        return [...previousDrafts, draft];
      }

      const nextDrafts = [...previousDrafts];
      nextDrafts[draftIndex] = draft;
      return nextDrafts;
    });
    setActiveDraftId(draft.id);
  };

  const loadOrderDraft = (draftId: string) => {
    const draft = orderDrafts.find((entry) => entry.id === draftId);
    if (!draft) return;

    replaceCart(draft.items);
    setDiscount(draft.discount, draft.discountType);
    setOrderNotes(draft.notes || "");
    setSelectedClient(draft.client || null);
    setActiveDraftId(draft.id);
  };

  const deleteOrderDraft = (draftId: string) => {
    setOrderDrafts((previousDrafts) =>
      previousDrafts.filter((draft) => draft.id !== draftId),
    );
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
  };

  const clearCart = () => {
    setActiveDraftId(null);
    clearCartState();
  };

  return (
    <POSContext.Provider
      value={{
        cart,
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
        orderDrafts,
        activeDraftId,
        saveOrderDraft,
        loadOrderDraft,
        deleteOrderDraft,
        orderNotes,
        setOrderNotes,
      }}
    >
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error("usePOS must be used within POSProvider");
  }
  return context;
}
