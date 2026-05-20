"use client";

import React, { createContext, useContext, useState } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

interface QuickModeContextType {
  isQuickMode: boolean;
  setIsQuickMode: (value: boolean) => void;
  toggleQuickMode: () => void;
}

const QuickModeContext = createContext<QuickModeContextType | undefined>(
  undefined,
);

export function QuickModeProvider({ children }: { children: React.ReactNode }) {
  const [isQuickMode, setIsQuickModeState] = useState(
    () => Storage.getItem(STORAGE_KEYS.sellQuickMode) === "true",
  );

  const setIsQuickMode = (value: boolean) => {
    setIsQuickModeState(value);
    Storage.setItem(STORAGE_KEYS.sellQuickMode, String(value));
  };

  const toggleQuickMode = () => {
    setIsQuickModeState((previous) => {
      const nextValue = !previous;
      Storage.setItem(STORAGE_KEYS.sellQuickMode, String(nextValue));
      return nextValue;
    });
  };

  return (
    <QuickModeContext.Provider
      value={{
        isQuickMode,
        setIsQuickMode,
        toggleQuickMode,
      }}
    >
      {children}
    </QuickModeContext.Provider>
  );
}

export function useQuickMode() {
  const context = useContext(QuickModeContext);
  if (!context) {
    throw new Error("useQuickMode must be used within QuickModeProvider");
  }
  return context;
}
