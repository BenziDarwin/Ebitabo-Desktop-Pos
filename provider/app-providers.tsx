"use client";

import React from "react";
import { AuthProvider } from "@/provider/auth-provider";
import { CartProvider } from "@/provider/cart-provider";
import { POSProvider } from "@/provider/pos-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <POSProvider>{children}</POSProvider>
      </CartProvider>
    </AuthProvider>
  );
}
