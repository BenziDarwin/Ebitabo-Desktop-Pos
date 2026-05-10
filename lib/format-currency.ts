import type { CurrencyDetails } from "@/core/entities";

interface FormatCurrencyOptions {
  locale?: string;
}

function isIsoCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function normalizeCurrencyCode(raw?: string | null): string | null {
  if (!raw) return null;
  const candidate = raw.trim().toUpperCase();
  return isIsoCurrencyCode(candidate) ? candidate : null;
}

export function resolveCurrencyCode(
  currency?: CurrencyDetails | null,
): string | null {
  const fromName = normalizeCurrencyCode(currency?.name);
  if (fromName) return fromName;

  const fullName = currency?.full_name ?? "";
  const matchedCode = fullName.match(/\b[A-Z]{3}\b/);
  if (matchedCode?.[0]) return matchedCode[0];

  return null;
}

function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function getCurrencyMarker(currency?: CurrencyDetails | null): string {
  if (currency?.symbol?.trim()) return currency.symbol.trim();

  const code = resolveCurrencyCode(currency);
  if (code) return code;

  if (currency?.name?.trim()) return currency.name.trim();
  if (currency?.full_name?.trim()) return currency.full_name.trim();
  return "$";
}

export function formatCurrency(
  value: number,
  currency?: CurrencyDetails | null,
  options: FormatCurrencyOptions = {},
): string {
  const locale = options.locale ?? "en-US";
  const safeValue = Number.isFinite(value) ? value : 0;
  const code = resolveCurrencyCode(currency);

  if (code) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
      }).format(safeValue);
    } catch {
      // fall back to marker format below
    }
  }

  const marker = getCurrencyMarker(currency);
  return `${marker} ${formatDecimal(safeValue, locale)}`;
}
