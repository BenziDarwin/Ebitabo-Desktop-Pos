import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessDetails, CompletedOrder } from "@/core/entities";
import { syncPendingTransactions } from "@/services/transaction-sync-service";
import {
  readLocalSalesRecords,
  writeLocalSalesRecords,
} from "@/services/repositories/local-sales-storage";
import {
  createSaleFromCart,
  extractRemoteSaleId,
} from "@/services/sales-service";

vi.mock("@/services/repositories/local-sales-storage", () => ({
  readLocalSalesRecords: vi.fn(() => []),
  writeLocalSalesRecords: vi.fn(),
}));

vi.mock("@/services/sales-service", () => ({
  createSaleFromCart: vi.fn(),
  extractRemoteSaleId: vi.fn(() => 901),
}));

function buildPendingOrder(): CompletedOrder {
  return {
    id: "order-1",
    items: [
      {
        id: "item-1",
        productId: "11",
        name: "Rice",
        quantity: 1,
        price: 120,
        tax: 0,
        subtotal: 120,
      },
    ],
    client: {
      id: "client-1",
      name: "Client One",
      advancedAmount: 0,
      createdAt: new Date(),
    },
    subtotal: 120,
    tax: 0,
    total: 120,
    discount: 0,
    discountType: "amount",
    notes: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "20",
    payments: [{ method: "Cash", amount: 120, date: new Date().toISOString() }],
    change: 0,
    completedAt: new Date(),
    sync: {
      status: "pending",
      remoteSaleId: null,
      syncedAt: null,
      lastSyncError: null,
      paymentMethod: "Cash",
      amountPaid: 120,
      currencyId: 1,
      businessAccountType: "Sales Business",
      businessUserId: "20",
      createdBy: "Cashier",
    },
    receipt: undefined,
  };
}

const business: BusinessDetails = {
  id: 91,
  name: "Test Business",
  account_type: "Sales Business",
  currency_id: 1,
  business_logo: null,
  dateExpiry: "2099-01-01T00:00:00.000Z",
  phone_numbers: [],
  contact_details: null,
  company_name: null,
  company_address: null,
  company_phone: null,
  company_email: null,
  apiUrl: "https://example.com",
  userId: "20",
};

describe("syncPendingTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLocalSalesRecords).mockReturnValue([buildPendingOrder()]);
    vi.mocked(extractRemoteSaleId).mockReturnValue(901);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("deduplicates concurrent sync runs to avoid duplicate remote sale creation", async () => {
    let resolveRemoteCreate: ((value: unknown) => void) | null = null;
    const remoteCreatePromise = new Promise((resolve) => {
      resolveRemoteCreate = resolve;
    });

    vi.mocked(createSaleFromCart).mockReturnValue(remoteCreatePromise);

    const firstSync = syncPendingTransactions({
      business,
      createdBy: "Cashier",
    });
    const secondSync = syncPendingTransactions({
      business,
      createdBy: "Cashier",
    });

    expect(createSaleFromCart).toHaveBeenCalledTimes(1);

    resolveRemoteCreate?.({});

    const [firstResult, secondResult] = await Promise.all([
      firstSync,
      secondSync,
    ]);

    expect(firstResult).toEqual({
      attempted: 1,
      synced: 1,
      failed: 0,
      skipped: 0,
    });
    expect(secondResult).toEqual(firstResult);
    expect(writeLocalSalesRecords).toHaveBeenCalledTimes(1);
  });
});
