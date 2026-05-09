"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "../types";
import { authenticateUser } from "../mock-api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (url: string, username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("pos_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem("pos_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (
    url: string,
    username: string,
    password: string,
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const authenticatedUser = await authenticateUser(url, username, password);
      if (authenticatedUser) {
        setUser(authenticatedUser);
        localStorage.setItem("pos_user", JSON.stringify(authenticatedUser));
        return true;
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("pos_user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: user !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
