export const SUBSCRIPTION_EXPIRED_MESSAGE =
  "Business account has expired. Please renew your subscription to proceed with sales.";

export function isSubscriptionExpired(dateExpiry?: string | null): boolean {
  if (!dateExpiry) return false;

  const expiryDate = new Date(dateExpiry);
  if (Number.isNaN(expiryDate.getTime())) {
    return false;
  }

  return expiryDate < new Date();
}
