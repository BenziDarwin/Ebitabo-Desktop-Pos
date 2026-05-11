export function normalizeAccountType(accountType?: string | null): string {
  return (accountType ?? "").trim().toLowerCase();
}

export function isSalesBusinessAccountType(
  accountType?: string | null,
): boolean {
  const normalized = normalizeAccountType(accountType);
  return normalized.includes("sales") || normalized.includes("product");
}
