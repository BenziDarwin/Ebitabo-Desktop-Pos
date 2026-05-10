import { STORAGE_KEYS } from "@/lib/constants";
import { isElectronRenderer } from "@/lib/runtime";
import { Storage } from "@/lib/storage";
import { toProxyPath } from "@/services/repositories/proxy-path";

const LOG_PREFIX = "[CatalogSync]";

interface SendRequestPayload {
  fields: string[];
  values?: Record<string, unknown>;
  function?: string;
  search_filter?: string;
  page_no?: number;
  limit?: number;
  [key: string]: unknown;
}

function normalizeClientUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRecordCollection(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }

  if (!isRecord(raw)) {
    return [];
  }

  const objectValues = Object.values(raw);
  if (objectValues.length > 0 && objectValues.every(isRecord)) {
    return objectValues as Record<string, unknown>[];
  }

  return [raw];
}

function ensureRecordArray(raw: unknown): Record<string, unknown>[] {
  if (!isRecord(raw)) {
    return normalizeRecordCollection(raw);
  }

  const candidate = raw as {
    records?: unknown;
    data?: unknown;
    result?: unknown;
  };
  const wrappedKeys: Array<keyof typeof candidate> = [
    "records",
    "data",
    "result",
  ];

  for (const key of wrappedKeys) {
    if (!(key in candidate)) continue;
    return normalizeRecordCollection(candidate[key]);
  }

  return normalizeRecordCollection(raw);
}

export async function sendRequestModel(
  model: string,
  payload: SendRequestPayload,
  overrides?: {
    clientUrl?: string;
    apiKey?: string;
    query?: string;
  },
): Promise<Record<string, unknown>[]> {
  const resolvedClientUrl =
    overrides?.clientUrl ?? Storage.getItem(STORAGE_KEYS.clientUrl);
  const clientUrl = resolvedClientUrl
    ? normalizeClientUrl(resolvedClientUrl)
    : resolvedClientUrl;
  const apiKey = overrides?.apiKey ?? Storage.getItem(STORAGE_KEYS.apiKey);

  if (!clientUrl || !apiKey) {
    console.warn(`${LOG_PREFIX} sendRequest skipped`, {
      model,
      hasClientUrl: Boolean(clientUrl),
      hasApiKey: Boolean(apiKey),
    });
    return [];
  }

  const queryParts = [`model=${encodeURIComponent(model)}`];
  if (overrides?.query) {
    queryParts.push(overrides.query);
  }
  if (isElectronRenderer()) {
    queryParts.push(`target=${encodeURIComponent(clientUrl)}`);
  }
  const proxyUrl = toProxyPath("/send_request", queryParts.join("&"));
  console.info(`${LOG_PREFIX} sendRequest start`, {
    model,
    proxyUrl,
    clientUrl,
    pageNo: payload.page_no,
    limit: payload.limit,
  });

  let response: Response;
  try {
    response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        "x-ebitabo-client-url": clientUrl,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} sendRequest network error`, {
      model,
      error,
    });
    return [];
  }

  const raw = await response.text();
  const trimmed = raw.trim();
  console.info(`${LOG_PREFIX} sendRequest response`, {
    model,
    status: response.status,
    ok: response.ok,
    rawLength: trimmed.length,
  });

  if (!response.ok || !trimmed || /^<!doctype html>|^<html/i.test(trimmed)) {
    console.warn(`${LOG_PREFIX} sendRequest rejected response`, {
      model,
      status: response.status,
      isHtml: /^<!doctype html>|^<html/i.test(trimmed),
      hasBody: Boolean(trimmed),
    });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    console.error(`${LOG_PREFIX} sendRequest parse error`, {
      model,
      error,
    });
    return [];
  }
  const records = ensureRecordArray(parsed);
  const firstRecordKeys =
    records.length > 0 ? Object.keys(records[0]).slice(0, 12) : [];
  console.info(`${LOG_PREFIX} sendRequest parsed`, {
    model,
    records: records.length,
    firstRecordKeys,
  });

  return records;
}
