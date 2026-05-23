import type { BusinessDetails } from "@/core/entities";

interface ResolveBusinessForSaleOptions {
  currentBusiness?: BusinessDetails | null;
  refreshBusinessDetails: () => Promise<BusinessDetails | null>;
  isOnline?: boolean;
}

export function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function resolveBusinessForSale({
  currentBusiness = null,
  refreshBusinessDetails,
  isOnline = isBrowserOnline(),
}: ResolveBusinessForSaleOptions): Promise<BusinessDetails | null> {
  if (!isOnline) {
    return currentBusiness;
  }

  try {
    const refreshedBusiness = await refreshBusinessDetails();
    return refreshedBusiness ?? currentBusiness;
  } catch {
    return currentBusiness;
  }
}
