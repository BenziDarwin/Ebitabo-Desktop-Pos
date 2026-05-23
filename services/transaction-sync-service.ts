import type { BusinessDetails, CompletedOrder } from "@/core/entities";
import {
  readLocalSalesRecords,
  writeLocalSalesRecords,
} from "@/services/repositories/local-sales-storage";
import {
  createSaleFromCart,
  extractRemoteSaleId,
} from "@/services/sales-service";

export interface SyncPendingTransactionsResult {
  attempted: number;
  synced: number;
  failed: number;
  skipped: number;
}

interface SyncPendingTransactionsOptions {
  business?: BusinessDetails | null;
  createdBy?: string;
}

let syncPendingTransactionsInFlight: Promise<SyncPendingTransactionsResult> | null =
  null;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function buildBusinessForSync(
  order: CompletedOrder,
  fallbackBusiness?: BusinessDetails | null,
): BusinessDetails | null {
  const accountType =
    order.sync.businessAccountType ?? fallbackBusiness?.account_type ?? "";
  const userId = (order.sync.businessUserId || fallbackBusiness?.userId || "")
    .trim()
    .toString();
  if (!accountType || !userId) {
    return null;
  }

  const currencyId = Number(
    order.sync.currencyId || fallbackBusiness?.currency_id || 0,
  );

  return {
    id: fallbackBusiness?.id ?? 0,
    name: fallbackBusiness?.name ?? "Business",
    account_type: accountType,
    currency_id: Number.isFinite(currencyId) ? currencyId : 0,
    business_logo: fallbackBusiness?.business_logo ?? null,
    dateExpiry: fallbackBusiness?.dateExpiry ?? null,
    phone_numbers: fallbackBusiness?.phone_numbers ?? [],
    contact_details: fallbackBusiness?.contact_details ?? null,
    company_name: fallbackBusiness?.company_name ?? null,
    company_address: fallbackBusiness?.company_address ?? null,
    company_phone: fallbackBusiness?.company_phone ?? null,
    company_email: fallbackBusiness?.company_email ?? null,
    apiUrl: fallbackBusiness?.apiUrl ?? "",
    userId,
  };
}

function markSyncFailure(
  order: CompletedOrder,
  reason: string,
): CompletedOrder {
  return {
    ...order,
    sync: {
      ...order.sync,
      status: "pending",
      lastSyncError: reason,
      syncedAt: null,
    },
  };
}

function markSynced(
  order: CompletedOrder,
  remoteSaleId: number | null,
): CompletedOrder {
  return {
    ...order,
    sync: {
      ...order.sync,
      status: "synced",
      remoteSaleId,
      syncedAt: new Date(),
      lastSyncError: null,
    },
  };
}

export async function syncPendingTransactions(
  options: SyncPendingTransactionsOptions = {},
): Promise<SyncPendingTransactionsResult> {
  if (syncPendingTransactionsInFlight) {
    return syncPendingTransactionsInFlight;
  }

  syncPendingTransactionsInFlight = (async () => {
    const result: SyncPendingTransactionsResult = {
      attempted: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
    };

    if (isOffline()) {
      return result;
    }

    const records = readLocalSalesRecords();
    if (records.length === 0) {
      return result;
    }

    const nextRecords = [...records];
    let hasChanges = false;

    for (let index = 0; index < nextRecords.length; index += 1) {
      const order = nextRecords[index];
      if (order.sync.status !== "pending") {
        continue;
      }

      result.attempted += 1;

      if (!order.client) {
        nextRecords[index] = markSyncFailure(
          order,
          "Missing client. Unable to sync this transaction.",
        );
        result.failed += 1;
        hasChanges = true;
        continue;
      }

      const business = buildBusinessForSync(order, options.business);
      if (!business) {
        nextRecords[index] = markSyncFailure(
          order,
          "Missing business details for sync.",
        );
        result.failed += 1;
        hasChanges = true;
        continue;
      }

      try {
        const response = await createSaleFromCart({
          business,
          cart: order.items,
          client: order.client,
          paymentMethod: order.sync.paymentMethod,
          amountPaid: order.sync.amountPaid,
          currencyId: order.sync.currencyId || business.currency_id,
          subtotal: order.subtotal,
          discount: order.discount,
          discountType: order.discountType,
          createdBy: order.sync.createdBy ?? options.createdBy,
        });
        const remoteSaleId = extractRemoteSaleId(response);
        nextRecords[index] = markSynced(order, remoteSaleId);
        result.synced += 1;
        hasChanges = true;
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Sync failed unexpectedly.";
        nextRecords[index] = markSyncFailure(order, reason);
        result.failed += 1;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      writeLocalSalesRecords(nextRecords);
    }

    return result;
  })();

  try {
    return await syncPendingTransactionsInFlight;
  } finally {
    syncPendingTransactionsInFlight = null;
  }
}
