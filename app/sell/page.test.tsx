import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SellPage from "@/app/sell/page";
import { SUBSCRIPTION_EXPIRED_MESSAGE } from "@/lib/subscription";
import { toast } from "sonner";
import { completeOrder } from "@/services/order-service";
import {
  createSaleFromCart,
  fetchBusinessClients,
  getCachedBusinessClients,
} from "@/services/sales-service";
import { printReceiptWeb } from "@/lib/print-receipt";

const useAuthMock = vi.fn();
const usePOSMock = vi.fn();
const useQuickModeMock = vi.fn();

vi.mock("@/provider/auth-provider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/provider/pos-provider", () => ({
  usePOS: () => usePOSMock(),
}));

vi.mock("@/provider/quick-mode-provider", () => ({
  useQuickMode: () => useQuickModeMock(),
}));

vi.mock("@/components/pos-layout", () => ({
  POSLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/product-catalog", () => ({
  ProductCatalog: () => <div>Catalog</div>,
}));

vi.mock("@/components/cart-summary", () => ({
  CartSummary: ({ onCheckout }: { onCheckout: () => void }) => (
    <button onClick={onCheckout} type="button">
      Open Checkout
    </button>
  ),
}));

vi.mock("@/services/catalog-service", () => ({
  syncCatalogFromCloud: vi.fn(async () => ({
    products: 1,
    services: 0,
    syncedAt: new Date(),
  })),
}));

vi.mock("@/services/order-service", () => ({
  completeOrder: vi.fn(),
}));

vi.mock("@/lib/print-receipt", () => ({
  printReceiptWeb: vi.fn(() => true),
}));

vi.mock("@/services/cart-stock-service", () => ({
  findFirstInsufficientStock: vi.fn(() => null),
  formatStockQuantity: vi.fn(() => "0"),
  getLocalProductStockMap: vi.fn(() => new Map()),
}));

vi.mock("@/services/sales-service", () => ({
  createSaleFromCart: vi.fn(),
  extractRemoteSaleId: vi.fn(() => 999),
  fetchBusinessClients: vi.fn(async () => []),
  getCachedBusinessClients: vi.fn(() => []),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("SellPage create-sale safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickModeMock.mockReturnValue({ isQuickMode: false });

    const expiredBusiness = {
      id: 12,
      name: "Test Business",
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
      userId: "9",
    };

    const refreshBusinessDetails = vi.fn(async () => expiredBusiness);

    useAuthMock.mockReturnValue({
      user: {
        id: "9",
        name: "Cashier",
        username: "cashier",
      },
      business: expiredBusiness,
      currency: {
        id: 1,
        name: "USD",
        symbol: "$",
      },
      isReady: true,
      isAuthenticated: true,
      fetchBusinessDetails: refreshBusinessDetails,
    });

    usePOSMock.mockReturnValue({
      cart: [
        {
          id: "1",
          productId: "1",
          name: "Soda",
          quantity: 1,
          price: 120,
          tax: 0,
          subtotal: 120,
        },
      ],
      cartSubtotal: 120,
      cartTax: 0,
      cartTotal: 120,
      discount: 0,
      discountType: "amount",
      selectedClient: {
        id: "7",
        name: "Client A",
        advancedAmount: 0,
        createdAt: new Date(),
      },
      setSelectedClient: vi.fn(),
      orderNotes: "",
      activeDraftId: null,
      orderDrafts: [],
      saveOrderDraft: vi.fn(),
      deleteOrderDraft: vi.fn(),
      clearCart: vi.fn(),
    });
  });

  it("ignores duplicate in-flight clicks and blocks expired subscriptions", async () => {
    render(<SellPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open Checkout" }));

    const createSaleButton = await screen.findByRole("button", {
      name: "Create Sale",
    });

    fireEvent.click(createSaleButton);
    fireEvent.click(createSaleButton);

    await waitFor(() => {
      const auth = useAuthMock.mock.results[0]?.value as {
        fetchBusinessDetails: ReturnType<typeof vi.fn>;
      };
      expect(auth.fetchBusinessDetails).toHaveBeenCalledTimes(1);
    });

    expect(fetchBusinessClients).toHaveBeenCalled();
    expect(getCachedBusinessClients).toHaveBeenCalled();
    expect(createSaleFromCart).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(SUBSCRIPTION_EXPIRED_MESSAGE);
  });

  it.each([
    { quickMode: false, label: "normal mode" },
    { quickMode: true, label: "quick mode" },
  ])("creates one sale for a double click in $label", async ({ quickMode }) => {
    const activeBusiness = {
      id: 12,
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
      userId: "9",
    };

    const refreshBusinessDetails = vi.fn(async () => activeBusiness);

    useQuickModeMock.mockReturnValue({ isQuickMode: quickMode });
    useAuthMock.mockReturnValue({
      user: {
        id: "9",
        name: "Cashier",
        username: "cashier",
      },
      business: activeBusiness,
      currency: {
        id: 1,
        name: "USD",
        symbol: "$",
      },
      isReady: true,
      isAuthenticated: true,
      fetchBusinessDetails: refreshBusinessDetails,
    });

    let resolveRemoteCreate: ((value: unknown) => void) | null = null;
    const remoteCreatePromise = new Promise((resolve) => {
      resolveRemoteCreate = resolve;
    });
    vi.mocked(createSaleFromCart).mockReturnValue(remoteCreatePromise);

    render(<SellPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open Checkout" }));

    const createSaleButton = await screen.findByRole("button", {
      name: "Create Sale",
    });

    fireEvent.click(createSaleButton);
    fireEvent.click(createSaleButton);

    await waitFor(() => {
      expect(refreshBusinessDetails).toHaveBeenCalledTimes(1);
      expect(createSaleFromCart).toHaveBeenCalledTimes(1);
    });

    resolveRemoteCreate?.({});

    await waitFor(() => {
      expect(completeOrder).toHaveBeenCalledTimes(1);
    });
  });

  it("in quick mode shows receipt print dialog even when sale is pending sync", async () => {
    const activeBusiness = {
      id: 12,
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
      userId: "9",
    };

    useQuickModeMock.mockReturnValue({ isQuickMode: true });
    useAuthMock.mockReturnValue({
      user: {
        id: "9",
        name: "Cashier",
        username: "cashier",
      },
      business: activeBusiness,
      currency: {
        id: 1,
        name: "USD",
        symbol: "$",
      },
      isReady: true,
      isAuthenticated: true,
      fetchBusinessDetails: vi.fn(async () => activeBusiness),
    });

    vi.mocked(createSaleFromCart).mockRejectedValue(
      new Error("Cloud create-sale failed"),
    );
    vi.mocked(completeOrder).mockResolvedValue({
      id: "sale-1",
      items: [
        {
          id: "1",
          productId: "1",
          name: "Soda",
          quantity: 1,
          price: 120,
          tax: 0,
          subtotal: 120,
        },
      ],
      subtotal: 120,
      tax: 0,
      total: 120,
      discount: 0,
      discountType: "amount",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: "9",
      payments: [
        { method: "Cash", amount: 120, date: new Date().toISOString() },
      ],
      change: 0,
      completedAt: new Date(),
      sync: {
        status: "pending",
        remoteSaleId: null,
        syncedAt: null,
        lastSyncError: "Cloud create-sale failed",
        paymentMethod: "Cash",
        amountPaid: 120,
        currencyId: 1,
        businessAccountType: "Sales Business",
        businessUserId: "9",
        createdBy: "Cashier",
      },
    });

    render(<SellPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open Checkout" }));

    const createSaleButton = await screen.findByRole("button", {
      name: "Create Sale",
    });
    fireEvent.click(createSaleButton);

    expect(
      await screen.findByRole("heading", { name: "Print Receipt" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sale was saved successfully. Print receipt now?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Print Receipt$/ }));
    expect(printReceiptWeb).toHaveBeenCalled();
  });
});
