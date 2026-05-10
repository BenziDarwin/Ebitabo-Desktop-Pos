import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";

export class ApiClient {
  constructor(
    private readonly baseUrl = "",
    private readonly defaultHeaders: HeadersInit = {},
  ) {}

  async get<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: "GET" });
  }

  async post<T>(
    path: string,
    body?: unknown,
    init: RequestInit = {},
  ): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(
    path: string,
    body?: unknown,
    init: RequestInit = {},
  ): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(
    path: string,
    body?: unknown,
    init: RequestInit = {},
  ): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const apiKey = Storage.getItem(STORAGE_KEYS.apiKey);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "api-key": apiKey } : {}),
        ...this.defaultHeaders,
        ...(init.headers ?? {}),
      },
    });

    const raw = await response.text();
    const trimmed = raw.trim();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${trimmed || response.statusText || "Request failed"}`,
      );
    }

    if (!trimmed) {
      return null as T;
    }

    const startsWithHtml = /^<!doctype html>|^<html/i.test(trimmed);
    if (startsWithHtml) {
      throw new Error("Expected JSON response but received HTML.");
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new Error("Failed to parse API response JSON.");
    }
  }
}
