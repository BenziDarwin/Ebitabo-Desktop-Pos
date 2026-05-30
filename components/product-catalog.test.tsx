import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductCatalog } from "@/components/product-catalog";
import {
  getProducts,
  getServices,
  searchProducts,
} from "@/services/catalog-service";

const useAuthMock = vi.fn();
const usePOSMock = vi.fn();

vi.mock("@/provider/auth-provider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/provider/pos-provider", () => ({
  usePOS: () => usePOSMock(),
}));

vi.mock("@/services/catalog-service", () => ({
  getProducts: vi.fn(),
  getServices: vi.fn(),
  searchProducts: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("ProductCatalog behavior", () => {
  const addToCartMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      cart: [],
    });

    useAuthMock.mockReturnValue({
      currency: {
        id: 1,
        name: "USD",
        symbol: "$",
      },
      business: {
        account_type: "Sales Business",
      },
    });

    vi.mocked(searchProducts).mockResolvedValue([]);
    vi.mocked(getProducts).mockResolvedValue([]);
    vi.mocked(getServices).mockResolvedValue([]);
  });

  it("fetches only products for sales businesses", async () => {
    useAuthMock.mockReturnValue({
      currency: { id: 1, name: "USD", symbol: "$" },
      business: { account_type: "Sales Business" },
    });

    render(<ProductCatalog quickMode={false} />);

    await waitFor(() => {
      expect(getProducts).toHaveBeenCalled();
    });

    expect(getServices).not.toHaveBeenCalled();
  });

  it("fetches products and services for services businesses", async () => {
    useAuthMock.mockReturnValue({
      currency: { id: 1, name: "USD", symbol: "$" },
      business: { account_type: "Services Business" },
    });

    render(<ProductCatalog quickMode={false} />);

    await waitFor(() => {
      expect(getProducts).toHaveBeenCalled();
      expect(getServices).toHaveBeenCalled();
    });
  });

  it("in quick mode auto-adds only when there is a single exact barcode match", async () => {
    vi.mocked(getProducts).mockResolvedValue([
      {
        id: "prod-1",
        name: "Bottle Water",
        barcode: "123456",
        sku: "BW-1",
        category: "Beverages",
        price: 500,
        tax: 0,
        stock: 12,
        createdAt: new Date(),
      },
    ]);

    render(<ProductCatalog quickMode={true} />);

    const searchInput = await screen.findByPlaceholderText(
      "Search products or services...",
    );
    fireEvent.change(searchInput, { target: { value: "123456" } });

    await waitFor(() => {
      expect(addToCartMock).toHaveBeenCalledTimes(1);
    });
  });

  it("in quick mode does not auto-add when barcode has multiple exact matches", async () => {
    vi.mocked(getProducts).mockResolvedValue([
      {
        id: "prod-1",
        name: "Milk 500ml",
        barcode: "777",
        sku: "MILK-1",
        category: "Dairy",
        price: 1000,
        tax: 0,
        stock: 5,
        createdAt: new Date(),
      },
      {
        id: "prod-2",
        name: "Milk 1L",
        barcode: "777",
        sku: "MILK-2",
        category: "Dairy",
        price: 1500,
        tax: 0,
        stock: 3,
        createdAt: new Date(),
      },
    ]);

    render(<ProductCatalog quickMode={true} />);

    const searchInput = await screen.findByPlaceholderText(
      "Search products or services...",
    );
    fireEvent.change(searchInput, { target: { value: "777" } });

    await waitFor(() => {
      expect(getProducts).toHaveBeenCalledTimes(2);
    });

    expect(addToCartMock).not.toHaveBeenCalled();
  });

  it("renders all matching products even when ids are duplicated", async () => {
    useAuthMock.mockReturnValue({
      currency: { id: 1, name: "USD", symbol: "$" },
      business: { account_type: "Sales Business" },
    });
    vi.mocked(getProducts).mockResolvedValue([
      {
        id: "dup-id",
        name: "Duplicate A",
        barcode: "111",
        sku: "DUP-A",
        category: "Category",
        price: 100,
        tax: 0,
        stock: 2,
        createdAt: new Date(),
      },
      {
        id: "dup-id",
        name: "Duplicate B",
        barcode: "222",
        sku: "DUP-B",
        category: "Category",
        price: 200,
        tax: 0,
        stock: 3,
        createdAt: new Date(),
      },
    ]);

    render(<ProductCatalog quickMode={false} />);

    await waitFor(() => {
      expect(screen.getByText("Duplicate A")).toBeInTheDocument();
      expect(screen.getByText("Duplicate B")).toBeInTheDocument();
    });
  });
});
