import { STORAGE_KEYS } from "@/lib/constants";
import { isElectronRenderer } from "@/lib/runtime";
import { Storage } from "@/lib/storage";
import { toProxyPath } from "@/services/repositories/proxy-path";

export interface DailySalesRecord {
  date_sale: string;
  sum_amount_sale: number;
}

function normalizeClientUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeDailySalesCollection(raw: unknown): DailySalesRecord[] {
  const rows = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.values(raw)
      : [];

  const normalized: DailySalesRecord[] = [];

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const date = String(row.date_sale ?? "").trim();
    const amount = toNumber(row.sum_amount_sale, NaN);
    if (!date || !Number.isFinite(amount)) continue;
    normalized.push({
      date_sale: date,
      sum_amount_sale: amount,
    });
  }

  return normalized;
}

export async function getSalesRecordByUserId(
  userId?: string | number | null,
): Promise<DailySalesRecord[]> {
  const resolvedUserId = String(userId ?? "").trim();
  const clientUrl = Storage.getItem(STORAGE_KEYS.clientUrl);
  const apiKey = Storage.getItem(STORAGE_KEYS.apiKey);

  if (!resolvedUserId || !clientUrl || !apiKey) {
    return [];
  }

  const normalizedClientUrl = normalizeClientUrl(clientUrl);
  const queryParts = [
    `model=${encodeURIComponent("business_reports.business_summary_userreport")}`,
    `user_id=${encodeURIComponent(resolvedUserId)}`,
  ];
  if (isElectronRenderer()) {
    queryParts.push(`target=${encodeURIComponent(normalizedClientUrl)}`);
  }

  try {
    const response = await fetch(
      toProxyPath("/send_request", queryParts.join("&")),
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
          "x-ebitabo-client-url": normalizedClientUrl,
        },
        body: JSON.stringify({
          function: "get_daily_sales",
        }),
      },
    );

    const raw = (await response.text()).trim();
    if (!response.ok || !raw || /^<!doctype html>|^<html/i.test(raw)) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return [];
    }

    const resultPayload =
      parsed.Result ?? parsed.result ?? parsed.records ?? parsed.data ?? parsed;
    return normalizeDailySalesCollection(resultPayload);
  } catch {
    return [];
  }
}
