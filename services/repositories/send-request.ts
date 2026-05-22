import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import {
  buildRemoteEndpointUrl,
  normalizeClientUrl,
} from "@/services/repositories/remote-endpoint";

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

  const entries = Object.entries(raw);
  const objectEntries = entries.filter(([, value]) => isRecord(value));

  if (objectEntries.length > 0) {
    const hasIndexedKeys = objectEntries.some(([key]) => /^\d+$/.test(key));
    if (hasIndexedKeys || objectEntries.length === entries.length) {
      return objectEntries.map(([, value]) => value as Record<string, unknown>);
    }
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
  const endpointUrl = buildRemoteEndpointUrl(
    clientUrl,
    "/send_request",
    queryParts.join("&"),
  );
  console.info(`${LOG_PREFIX} sendRequest start`, {
    model,
    endpointUrl,
    clientUrl,
    pageNo: payload.page_no,
    limit: payload.limit,
  });

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
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
