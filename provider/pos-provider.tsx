"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CartItem, Client, OrderDraft } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import { useAuth } from "@/provider/auth-provider";
import { useCart } from "@/provider/cart-provider";
import {
  deductLocalProductStock,
  restoreLocalProductStock,
} from "@/services/cart-stock-service";
import {
  fetchServerOrders,
  resolveNumericUserId,
} from "@/services/remote-order-service";

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
  deleteOrderDraft: (
    draftId: string,
    options?: { restoreStock?: boolean },
  ) => void;
  markOrderDraftCancelled: (draftId: string) => void;
  restoreOrderDraft: (draftId: string) => void;
  mergeServerOrders: (serverOrders: OrderDraft[]) => void;
  catalogVersion: number;
  bumpCatalogVersion: () => void;
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
  const { isAuthenticated, user, business } = useAuth();
  const [restoredDraftState] = useState(() => restoreDraftState());
  const [orderDrafts, setOrderDrafts] = useState<OrderDraft[]>(
    restoredDraftState.drafts,
  );
  const [activeDraftId, setActiveDraftId] = useState<string | null>(
    restoredDraftState.activeDraftId,
  );
  const [catalogVersion, setCatalogVersion] = useState(0);
  const hasSyncedServerOrdersRef = useRef(false);

  const bumpCatalogVersion = useCallback(() => {
    setCatalogVersion((prev) => prev + 1);
  }, []);
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
    const enrichedDraft: OrderDraft = {
      ...draft,
      reference:
        draft.reference ||
        `OrderRCTm-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      state: draft.state || "created",
    };
    setOrderDrafts((previousDrafts) => {
      const draftIndex = previousDrafts.findIndex(
        (existingDraft) => existingDraft.id === enrichedDraft.id,
      );
      if (draftIndex === -1) {
        deductLocalProductStock(enrichedDraft.items);
        return [...previousDrafts, enrichedDraft];
      }

      const existingDraft = previousDrafts[draftIndex];
      if (existingDraft.state !== "cancelled") {
        restoreLocalProductStock(existingDraft.items);
      }
      deductLocalProductStock(enrichedDraft.items);

      const nextDrafts = [...previousDrafts];
      nextDrafts[draftIndex] = enrichedDraft;
      return nextDrafts;
    });
    setActiveDraftId(enrichedDraft.id);
    bumpCatalogVersion();
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

  const deleteOrderDraft = (
    draftId: string,
    options?: { restoreStock?: boolean },
  ) => {
    const shouldRestoreStock = options?.restoreStock !== false;
    setOrderDrafts((previousDrafts) => {
      const draft = previousDrafts.find((d) => d.id === draftId);
      if (shouldRestoreStock && draft && draft.state !== "cancelled") {
        restoreLocalProductStock(draft.items);
      }
      return previousDrafts.filter((d) => d.id !== draftId);
    });
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
    if (shouldRestoreStock) {
      bumpCatalogVersion();
    }
  };

  const markOrderDraftCancelled = (draftId: string) => {
    setOrderDrafts((previousDrafts) =>
      previousDrafts.map((draft) => {
        if (draft.id === draftId) {
          if (draft.state !== "cancelled") {
            restoreLocalProductStock(draft.items);
          }
          return { ...draft, state: "cancelled" };
        }
        return draft;
      }),
    );
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
    bumpCatalogVersion();
  };

  const restoreOrderDraft = (draftId: string) => {
    setOrderDrafts((previousDrafts) =>
      previousDrafts.map((draft) => {
        if (draft.id === draftId) {
          if (draft.state === "cancelled") {
            deductLocalProductStock(draft.items);
          }
          return { ...draft, state: "created" };
        }
        return draft;
      }),
    );
    bumpCatalogVersion();
  };

  const mergeServerOrders = useCallback((serverOrders: OrderDraft[]) => {
    if (!serverOrders || serverOrders.length === 0) return;

    setOrderDrafts((previousDrafts) => {
      const nextDrafts = [...previousDrafts];
      for (const sOrder of serverOrders) {
        const index = nextDrafts.findIndex(
          (d) =>
            d.reference === sOrder.reference ||
            d.id === sOrder.id ||
            d.id === sOrder.reference,
        );

        if (index >= 0) {
          if (nextDrafts[index].state !== sOrder.state && sOrder.state) {
            nextDrafts[index] = {
              ...nextDrafts[index],
              state: sOrder.state,
            };
          }
        } else if (sOrder.state === "created") {
          nextDrafts.push(sOrder);
        }
      }
      return nextDrafts;
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || hasSyncedServerOrdersRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const userIdNum = resolveNumericUserId(user?.id, business?.userId);
    if (!userIdNum) return;

    hasSyncedServerOrdersRef.current = true;
    void fetchServerOrders(userIdNum)
      .then((fetched) => {
        if (fetched.length > 0) {
          mergeServerOrders(fetched);
        }
      })
      .catch((error) => {
        console.warn("[POSProvider] Initial server order sync failed:", error);
      });
  }, [isAuthenticated, user?.id, business?.userId, mergeServerOrders]);

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
        markOrderDraftCancelled,
        restoreOrderDraft,
        mergeServerOrders,
        catalogVersion,
        bumpCatalogVersion,
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
