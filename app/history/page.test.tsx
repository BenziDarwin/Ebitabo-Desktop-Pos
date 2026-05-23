import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPage from "@/app/history/page";
import { SUBSCRIPTION_EXPIRED_MESSAGE } from "@/lib/subscription";
import { toast } from "sonner";
import { syncPendingTransactions } from "@/services/transaction-sync-service";

const useAuthMock = vi.fn();

vi.mock("@/provider/auth-provider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/pos-layout", () => ({
  POSLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/order-details-dialog", () => ({
  OrderDetailsDialog: () => null,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: () => null,
}));

vi.mock("@/services/history-service", () => ({
  getOrderHistory: vi.fn(async () => [
    {
      id: "order-1",
      items: [
        {
          id: "item-1",
          productId: "11",
          name: "Rice",
          quantity: 2,
          price: 100,
          tax: 0,
          subtotal: 200,
        },
      ],
      client: {
        id: "client-1",
        name: "Client One",
        advancedAmount: 0,
        createdAt: new Date(),
      },
      subtotal: 200,
      tax: 0,
      total: 200,
      discount: 0,
      discountType: "amount",
      notes: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: "20",
      payments: [
        { method: "Cash", amount: 200, date: new Date().toISOString() },
      ],
      change: 0,
      completedAt: new Date(),
      sync: {
        status: "pending",
        remoteSaleId: null,
        syncedAt: null,
        lastSyncError: null,
        paymentMethod: "Cash",
        amountPaid: 200,
        currencyId: 1,
        businessAccountType: "Sales Business",
        businessUserId: "20",
        createdBy: "Cashier",
      },
      receipt: undefined,
    },
  ]),
}));

vi.mock("@/services/history-reports-service", () => ({
  getSalesRecordByUserId: vi.fn(async () => []),
}));

vi.mock("@/services/transaction-sync-service", () => ({
  syncPendingTransactions: vi.fn(async () => ({
    attempted: 1,
    synced: 1,
    failed: 0,
    skipped: 0,
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("HistoryPage pending-sync safeguards", () => {
  const fetchBusinessDetailsMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const expiredBusiness = {
      id: 91,
      name: "Expired Biz",
      account_type: "Sales Business",
      currency_id: 1,
      business_logo: null,
      dateExpiry: "2000-01-01T00:00:00.000Z",
      phone_numbers: [],
      contact_details: null,
      company_name: null,
      company_address: null,
      company_phone: null,
      company_email: null,
      apiUrl: "https://example.com",
      userId: "20",
    };

    fetchBusinessDetailsMock.mockResolvedValue(expiredBusiness);

    useAuthMock.mockReturnValue({
      user: {
        id: "20",
        username: "cashier",
        name: "Cashier",
      },
      business: expiredBusiness,
      currency: {
        id: 1,
        name: "USD",
        symbol: "$",
      },
      fetchBusinessDetails: fetchBusinessDetailsMock,
    });
  });

  it("refreshes business details and blocks sync when subscription is expired", async () => {
    render(<HistoryPage />);

    const syncButton = await screen.findByRole("button", {
      name: /Sync Pending \(1\)/i,
    });

    await waitFor(() => {
      expect(fetchBusinessDetailsMock).toHaveBeenCalledTimes(1);
    });

    const callsBeforeManualSync = fetchBusinessDetailsMock.mock.calls.length;

    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(fetchBusinessDetailsMock).toHaveBeenCalledTimes(
        callsBeforeManualSync + 1,
      );
    });

    expect(syncPendingTransactions).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(SUBSCRIPTION_EXPIRED_MESSAGE);
  });
});
