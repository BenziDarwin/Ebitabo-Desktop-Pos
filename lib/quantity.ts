export const QUANTITY_MAX_DECIMALS = 3;
export const QUANTITY_STEP = 0.1;
export const MIN_QUANTITY = 0.001;

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function roundToQuantityPrecision(value: number): number {
  const factor = 10 ** QUANTITY_MAX_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function toNonNegativeQuantity(value: number): number {
  return Math.max(0, roundToQuantityPrecision(toFiniteNumber(value)));
}

export function toPositiveQuantity(
  value: number,
  fallback = MIN_QUANTITY,
): number {
  const normalized = toNonNegativeQuantity(value);
  if (normalized > 0) return normalized;
  return Math.max(MIN_QUANTITY, toNonNegativeQuantity(fallback));
}

export function formatQuantity(value: number, locale?: string): string {
  return toNonNegativeQuantity(value).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: QUANTITY_MAX_DECIMALS,
  });
}
