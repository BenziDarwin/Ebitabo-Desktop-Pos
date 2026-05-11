import { parseJsonSafely } from "@/lib/safe-json";

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export const Storage = {
  getItem(key: string): string | null {
    if (!canUseStorage()) return null;

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (!canUseStorage()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.warn("[Storage] Failed to persist key", {
        key,
        error,
      });
    }
  },

  removeItem(key: string): void {
    if (!canUseStorage()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // no-op
    }
  },

  clearKeys(keys: string[]): void {
    keys.forEach((key) => this.removeItem(key));
  },

  getJson<T>(key: string, fallback: T): T {
    return parseJsonSafely<T>(this.getItem(key), fallback);
  },

  setJson<T>(key: string, value: T): void {
    this.setItem(key, JSON.stringify(value));
  },
};
