"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { BusinessDetails, CurrencyDetails, User } from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import {
  fetchBusinessDetails as fetchBusinessDetailsService,
  fetchCurrencyDetails as fetchCurrencyDetailsService,
  getStoredCookies,
  loginWithCredentials,
  logoutSession,
} from "@/services/auth-service";

interface AuthContextType {
  user: User | null;
  business: BusinessDetails | null;
  currency: CurrencyDetails | null;
  isAuthenticated: boolean;
  isReady: boolean;
  isLoading: boolean;
  login: (url: string, username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getCookies: () => string | null;
  fetchBusinessDetails: (
    clientUrl?: string,
    apiKey?: string,
    userId?: string,
  ) => Promise<BusinessDetails | null>;
  getCurrency: (
    currencyId: number,
    clientUrl?: string,
    apiKey?: string,
  ) => Promise<CurrencyDetails | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function restoreUser(): User | null {
  const raw = Storage.getJson<User | null>(STORAGE_KEYS.user, null);
  if (!raw) return null;
  return {
    ...raw,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
  };
}

function restoreBusiness(): BusinessDetails | null {
  return Storage.getJson<BusinessDetails | null>(
    STORAGE_KEYS.businessDetails,
    null,
  );
}

function restoreCurrency(): CurrencyDetails | null {
  return Storage.getJson<CurrencyDetails | null>(
    STORAGE_KEYS.currencyDetails,
    null,
  );
}

function hasValidSessionData(): boolean {
  return Boolean(
    Storage.getItem(STORAGE_KEYS.apiKey) &&
    Storage.getItem(STORAGE_KEYS.clientUrl) &&
    Storage.getItem(STORAGE_KEYS.businessDetails) &&
    Storage.getItem(STORAGE_KEYS.currencyDetails),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<BusinessDetails | null>(null);
  const [currency, setCurrency] = useState<CurrencyDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const restoredUser = restoreUser();
    const restoredBusiness = restoreBusiness();
    const restoredCurrency = restoreCurrency();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(restoredUser);
    setBusiness(restoredBusiness);
    setCurrency(restoredCurrency);
    setIsAuthenticated(hasValidSessionData());
    setIsReady(true);
  }, []);

  const getCurrency = async (
    currencyId: number,
    clientUrl?: string,
    apiKey?: string,
  ): Promise<CurrencyDetails | null> => {
    const resolved = await fetchCurrencyDetailsService(
      currencyId,
      clientUrl,
      apiKey,
    );
    if (!resolved) return null;
    setCurrency(resolved);
    return resolved;
  };

  const fetchBusinessDetails = async (
    clientUrl?: string,
    apiKey?: string,
    userId?: string,
  ): Promise<BusinessDetails | null> => {
    const resolved = await fetchBusinessDetailsService(
      clientUrl,
      apiKey,
      userId,
    );
    if (!resolved) {
      return null;
    }

    setBusiness(resolved);
    const resolvedCurrency = await getCurrency(
      resolved.currency_id,
      resolved.apiUrl,
      apiKey,
    );
    if (resolvedCurrency) {
      setIsAuthenticated(true);
    }
    return resolved;
  };

  const login = async (
    url: string,
    username: string,
    password: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    let session: Awaited<ReturnType<typeof loginWithCredentials>> = null;

    try {
      session = await loginWithCredentials(url, username, password);
      if (session) {
        setUser(session.user);
      }
    } finally {
      await fetchBusinessDetails(
        session?.clientUrl,
        session?.apiKey,
        session?.userId,
      );
      setIsLoading(false);
    }

    const hasSession = Boolean(session);
    const hasContext = Boolean(
      Storage.getItem(STORAGE_KEYS.businessDetails) &&
      Storage.getItem(STORAGE_KEYS.currencyDetails),
    );

    setIsAuthenticated(hasSession && hasContext);
    return hasSession && hasContext;
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutSession();
      setUser(null);
      setBusiness(null);
      setCurrency(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    business,
    currency,
    isAuthenticated,
    isReady,
    isLoading,
    login,
    logout,
    getCookies: getStoredCookies,
    fetchBusinessDetails,
    getCurrency,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
