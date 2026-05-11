import type {
  AuthSession,
  BusinessDetails,
  CurrencyDetails,
} from "@/core/entities";
import { STORAGE_KEYS } from "@/lib/constants";
import { isElectronRenderer } from "@/lib/runtime";
import { Storage } from "@/lib/storage";
import { authenticateUserUseCase } from "@/services/container";
import { toProxyPath } from "@/services/repositories/proxy-path";
import { sendRequestModel } from "@/services/repositories/send-request";

function normalizeClientUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function resolveIdValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function splitPhones(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function loginWithCredentials(
  url: string,
  username: string,
  password: string,
): Promise<AuthSession | null> {
  let session: AuthSession | null = null;
  try {
    session = await authenticateUserUseCase.execute({
      url: normalizeClientUrl(url),
      username: username.trim(),
      password,
    });
  } catch {
    return null;
  }

  if (!session) return null;

  Storage.setItem(STORAGE_KEYS.apiKey, session.apiKey);
  Storage.setItem(STORAGE_KEYS.clientUrl, session.clientUrl);
  Storage.setItem(STORAGE_KEYS.userId, session.userId);
  Storage.setJson(STORAGE_KEYS.user, session.user);

  if (session.cookies) {
    Storage.setItem(STORAGE_KEYS.authCookies, session.cookies);
  }

  return session;
}

export async function fetchBusinessDetails(
  clientUrl?: string,
  apiKey?: string,
  userId?: string,
): Promise<BusinessDetails | null> {
  const resolvedClientUrl =
    clientUrl ?? Storage.getItem(STORAGE_KEYS.clientUrl) ?? undefined;
  const resolvedApiKey =
    apiKey ?? Storage.getItem(STORAGE_KEYS.apiKey) ?? undefined;
  const resolvedUserId =
    userId ?? Storage.getItem(STORAGE_KEYS.userId) ?? undefined;

  if (!resolvedClientUrl || !resolvedApiKey || !resolvedUserId) {
    return null;
  }

  const records = await sendRequestModel(
    "business_details.business_details",
    {
      fields: [
        "id",
        "name",
        "account_type",
        "currency_id",
        "business_logo",
        "dateExpiry",
        "phone_numbers",
        "contact_details",
        "company_name",
        "company_address",
        "company_phone",
        "company_email",
      ],
    },
    { clientUrl: resolvedClientUrl, apiKey: resolvedApiKey },
  );

  if (records.length === 0) {
    return null;
  }

  const raw = records[0];
  const resolvedCurrencyId = toNumber(resolveIdValue(raw.currency_id));
  const mapped: BusinessDetails = {
    id: toNumber(raw.id),
    name: String(raw.name ?? ""),
    account_type: String(raw.account_type ?? ""),
    currency_id: resolvedCurrencyId,
    business_logo: toNullableString(raw.business_logo),
    dateExpiry: toNullableString(raw.dateExpiry),
    phone_numbers: splitPhones(raw.phone_numbers),
    contact_details: toNullableString(raw.contact_details),
    company_name: toNullableString(raw.company_name),
    company_address: toNullableString(raw.company_address),
    company_phone: toNullableString(raw.company_phone),
    company_email: toNullableString(raw.company_email),
    apiUrl: resolvedClientUrl,
    userId: resolvedUserId,
  };

  Storage.setJson(STORAGE_KEYS.businessDetails, mapped);
  return mapped;
}

export async function fetchCurrencyDetails(
  currencyId: number,
  clientUrl?: string,
  apiKey?: string,
): Promise<CurrencyDetails | null> {
  const resolvedClientUrl =
    clientUrl ?? Storage.getItem(STORAGE_KEYS.clientUrl) ?? undefined;
  const resolvedApiKey =
    apiKey ?? Storage.getItem(STORAGE_KEYS.apiKey) ?? undefined;

  if (!resolvedClientUrl || !resolvedApiKey || !currencyId) {
    return null;
  }

  const records = await sendRequestModel(
    "res.currency",
    {
      fields: ["id", "name", "full_name", "symbol"],
    },
    {
      clientUrl: resolvedClientUrl,
      apiKey: resolvedApiKey,
      query: `Id=${encodeURIComponent(String(currencyId))}`,
    },
  );

  if (records.length === 0) {
    return null;
  }

  const raw = records[0];
  const mapped: CurrencyDetails = {
    id: toNumber(raw.id),
    name: String(raw.name ?? ""),
    full_name: toNullableString(raw.full_name),
    symbol: toNullableString(raw.symbol),
  };

  Storage.setJson(STORAGE_KEYS.currencyDetails, mapped);
  return mapped;
}

export function getStoredCookies(): string | null {
  return Storage.getItem(STORAGE_KEYS.authCookies);
}

export async function logoutSession(): Promise<void> {
  const clientUrl = Storage.getItem(STORAGE_KEYS.clientUrl);
  const cookies = Storage.getItem(STORAGE_KEYS.authCookies);

  if (clientUrl && cookies) {
    const proxyQuery = isElectronRenderer()
      ? `target=${encodeURIComponent(clientUrl)}`
      : undefined;
    try {
      await fetch(toProxyPath("/web/session/logout", proxyQuery), {
        method: "GET",
        headers: {
          Cookie: cookies,
          "x-ebitabo-client-url": clientUrl,
        },
      });
    } catch {
      // best effort remote logout
    }
  }

  Storage.clearKeys([
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.clientUrl,
    STORAGE_KEYS.businessDetails,
    STORAGE_KEYS.currencyDetails,
    STORAGE_KEYS.userId,
    STORAGE_KEYS.authCookies,
    STORAGE_KEYS.user,
    STORAGE_KEYS.catalogProducts,
    STORAGE_KEYS.catalogServices,
    STORAGE_KEYS.clientsProducts,
    STORAGE_KEYS.clientsServices,
    STORAGE_KEYS.catalogLastSyncedAt,
    STORAGE_KEYS.cartState,
    STORAGE_KEYS.orderDrafts,
    STORAGE_KEYS.activeOrderDraftId,
    STORAGE_KEYS.salesRecords,
  ]);
}
