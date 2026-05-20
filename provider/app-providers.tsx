"use client";

import React from "react";
import { AuthProvider, useAuth } from "@/provider/auth-provider";
import { CartProvider } from "@/provider/cart-provider";
import { POSProvider } from "@/provider/pos-provider";
import { QuickModeProvider } from "@/provider/quick-mode-provider";

function SessionScopedProviders({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const sessionKey = isAuthenticated ? `auth-${user?.id ?? "active"}` : "guest";

  return (
    <CartProvider key={`cart-${sessionKey}`}>
      <POSProvider key={`pos-${sessionKey}`}>{children}</POSProvider>
    </CartProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QuickModeProvider>
        <SessionScopedProviders>{children}</SessionScopedProviders>
      </QuickModeProvider>
    </AuthProvider>
  );
}
