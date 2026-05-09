"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { CartItem, OrderDraft, Client } from "../types";

interface POSContextType {
  // Cart
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItem: (itemId: string, quantity: number) => void;
  clearCart: () => void;

  // Calculations
  cartSubtotal: number;
  cartTax: number;
  cartTotal: number;

  // Discounts
  discount: number;
  discountType: "amount" | "percent";
  setDiscount: (amount: number, type: "amount" | "percent") => void;

  // Client
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;

  // Order Drafts
  orderDrafts: OrderDraft[];
  saveOrderDraft: (draft: OrderDraft) => void;
  loadOrderDraft: (draftId: string) => void;
  deleteOrderDraft: (draftId: string) => void;

  // Notes
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscountState] = useState(0);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount",
  );
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<OrderDraft[]>([]);
  const [orderNotes, setOrderNotes] = useState("");

  // Load drafts from localStorage on mount
  useEffect(() => {
    const savedDrafts = localStorage.getItem("pos_drafts");
    if (savedDrafts) {
      try {
        setOrderDrafts(JSON.parse(savedDrafts));
      } catch (e) {
        localStorage.removeItem("pos_drafts");
      }
    }
  }, []);

  // Save drafts to localStorage whenever they change
  useEffect(() => {
    if (orderDrafts.length > 0) {
      localStorage.setItem("pos_drafts", JSON.stringify(orderDrafts));
    }
  }, [orderDrafts]);

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const calculateTax = () => {
    return cart.reduce((sum, item) => sum + item.subtotal * item.tax, 0);
  };

  const subtotal = calculateSubtotal();
  const tax = calculateTax();
  let finalTotal = subtotal + tax;

  if (discountType === "amount") {
    finalTotal -= discount;
  } else {
    finalTotal -= finalTotal * (discount / 100);
  }

  const addToCart = (item: CartItem) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === item.id);
      if (existingItem) {
        return prevCart.map((i) =>
          i.id === item.id
            ? {
                ...i,
                quantity: i.quantity + item.quantity,
                subtotal: (i.quantity + item.quantity) * i.price,
              }
            : i,
        );
      }
      return [...prevCart, item];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((i) => i.id !== itemId));
  };

  const updateCartItem = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((i) =>
        i.id === itemId
          ? {
              ...i,
              quantity,
              subtotal: quantity * i.price,
            }
          : i,
      ),
    );
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0, "amount");
    setSelectedClient(null);
    setOrderNotes("");
  };

  const setDiscount = (amount: number, type: "amount" | "percent") => {
    setDiscountState(amount);
    setDiscountType(type);
  };

  const saveOrderDraft = (draft: OrderDraft) => {
    setOrderDrafts((prev) => {
      const existing = prev.findIndex((d) => d.id === draft.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = draft;
        return updated;
      }
      return [...prev, draft];
    });
  };

  const loadOrderDraft = (draftId: string) => {
    const draft = orderDrafts.find((d) => d.id === draftId);
    if (draft) {
      setCart(draft.items);
      setDiscount(draft.discount, draft.discountType);
      setOrderNotes(draft.notes || "");
      setSelectedClient(draft.client || null);
    }
  };

  const deleteOrderDraft = (draftId: string) => {
    setOrderDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  return (
    <POSContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateCartItem,
        clearCart,
        cartSubtotal: subtotal,
        cartTax: tax,
        cartTotal: finalTotal,
        discount,
        discountType,
        setDiscount,
        selectedClient,
        setSelectedClient,
        orderDrafts,
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
  if (context === undefined) {
    throw new Error("usePOS must be used within POSProvider");
  }
  return context;
}
