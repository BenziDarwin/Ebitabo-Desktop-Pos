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
  const removeFromCartMock = vi.fn();
  const updateCartItemMock = vi.fn();
  const updateCartItemPriceMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      removeFromCart: removeFromCartMock,
      updateCartItem: updateCartItemMock,
      updateCartItemPrice: updateCartItemPriceMock,
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

  it("shows compact stacked quick mode tables for selected and searchable items", async () => {
    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      removeFromCart: removeFromCartMock,
      updateCartItem: updateCartItemMock,
      updateCartItemPrice: updateCartItemPriceMock,
      cart: [
        {
          id: "selected-1",
          productId: "prod-1",
          name: "Selected Milk",
          quantity: 2,
          price: 1500,
          tax: 0,
          subtotal: 3000,
        },
      ],
    });

    render(<ProductCatalog quickMode={true} />);

    expect(await screen.findByText("Selected Items")).toBeInTheDocument();
    expect(screen.getByText("Items Needing Search")).toBeInTheDocument();
    expect(screen.getByText("Selected Milk")).toBeInTheDocument();
    expect(
      screen.getByText("Scan a barcode or search to load items"),
    ).toBeInTheDocument();
  });

  it("removes an item from selected quick mode table", async () => {
    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      removeFromCart: removeFromCartMock,
      updateCartItem: updateCartItemMock,
      updateCartItemPrice: updateCartItemPriceMock,
      cart: [
        {
          id: "selected-2",
          productId: "prod-2",
          name: "Selected Bread",
          quantity: 1,
          price: 800,
          tax: 0,
          subtotal: 800,
        },
      ],
    });

    render(<ProductCatalog quickMode={true} />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(removeFromCartMock).toHaveBeenCalledWith("selected-2");
  });

  it("updates selected item quantity with decimal values in quick mode", async () => {
    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      removeFromCart: removeFromCartMock,
      updateCartItem: updateCartItemMock,
      updateCartItemPrice: updateCartItemPriceMock,
      cart: [
        {
          id: "selected-3",
          productId: "prod-3",
          name: "Selected Rice",
          quantity: 1,
          price: 3000,
          tax: 0,
          subtotal: 3000,
        },
      ],
    });

    render(<ProductCatalog quickMode={true} />);

    const quantityInput = await screen.findByLabelText(
      "Quantity for Selected Rice",
    );
    fireEvent.change(quantityInput, { target: { value: "1.25" } });

    expect(updateCartItemMock).toHaveBeenCalledWith("selected-3", 1.25);
  });

  it("increments and decrements quantity from quick mode controls", async () => {
    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      removeFromCart: removeFromCartMock,
      updateCartItem: updateCartItemMock,
      updateCartItemPrice: updateCartItemPriceMock,
      cart: [
        {
          id: "selected-4",
          productId: "prod-4",
          name: "Selected Sugar",
          quantity: 2,
          price: 500,
          tax: 0,
          subtotal: 1000,
        },
      ],
    });

    render(<ProductCatalog quickMode={true} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Increase quantity for Selected Sugar",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Decrease quantity for Selected Sugar",
      }),
    );

    expect(updateCartItemMock).toHaveBeenCalledWith("selected-4", 3);
    expect(updateCartItemMock).toHaveBeenCalledWith("selected-4", 1);
  });

  it("updates quick mode unit price inline", async () => {
    usePOSMock.mockReturnValue({
      addToCart: addToCartMock,
      removeFromCart: removeFromCartMock,
      updateCartItem: updateCartItemMock,
      updateCartItemPrice: updateCartItemPriceMock,
      cart: [
        {
          id: "selected-5",
          productId: "prod-5",
          name: "Selected Flour",
          quantity: 1,
          price: 1300,
          tax: 0,
          subtotal: 1300,
        },
      ],
    });

    render(<ProductCatalog quickMode={true} />);

    const priceInput = await screen.findByLabelText(
      "Unit price for Selected Flour",
    );
    fireEvent.change(priceInput, { target: { value: "1450.5" } });

    expect(updateCartItemPriceMock).toHaveBeenCalledWith("selected-5", 1450.5);
  });
});
