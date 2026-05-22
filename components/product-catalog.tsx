"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { isSalesBusinessAccountType } from "@/lib/business-account-type";
import {
  getProducts,
  searchProducts,
  getServices,
} from "@/services/catalog-service";
import type { Product, Service } from "@/lib/types";
import { STORAGE_KEYS } from "@/lib/constants";
import { Storage } from "@/lib/storage";
import { formatCurrency } from "@/lib/format-currency";
import { formatQuantity } from "@/lib/quantity";
import { resolveImageUri } from "@/lib/resolve-image-uri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShoppingCart, Search } from "lucide-react";
import productFallbackImage from "@/assets/images/empty/product.png";
import serviceFallbackImage from "@/assets/images/empty/service.png";
import { toast } from "sonner";

const LOG_PREFIX = "[CatalogSync]";

function normalizeBarcodeIdentifier(value?: string): string {
  return (value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function isExactScanMatch(scanValue: string, candidate?: string): boolean {
  if (!scanValue || !candidate) return false;

  const normalizedScan = normalizeBarcodeIdentifier(scanValue);
  const normalizedCandidate = normalizeBarcodeIdentifier(candidate);
  if (!normalizedScan || !normalizedCandidate) return false;
  return normalizedScan === normalizedCandidate;
}

type CatalogImageKind = "product" | "service";

interface CatalogCardImageProps {
  imageValue?: string;
  alt: string;
  kind: CatalogImageKind;
  baseUrl?: string | null;
}

function CatalogCardImage({
  imageValue,
  alt,
  kind,
  baseUrl,
}: CatalogCardImageProps) {
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const imageSrc = resolveImageUri(imageValue, {
    baseUrl: baseUrl ?? undefined,
  });
  const didFailToLoad = Boolean(imageSrc) && failedImageSrc === imageSrc;
  const fallbackSrc =
    kind === "product" ? productFallbackImage.src : serviceFallbackImage.src;

  if (!imageSrc || didFailToLoad) {
    return (
      <div className="h-32 bg-slate-50 flex items-center justify-center p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallbackSrc}
          alt={`${alt} placeholder`}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="h-32 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-contain"
        onError={() => {
          console.warn(`${LOG_PREFIX} image load failed`, {
            item: alt,
            kind,
            srcPreview: imageSrc.slice(0, 120),
          });
          if (imageSrc) {
            setFailedImageSrc(imageSrc);
          }
        }}
      />
    </div>
  );
}

interface ProductCatalogProps {
  onSelectProduct?: (product: Product) => void;
  refreshKey?: number;
  isSyncingCatalog?: boolean;
  quickMode?: boolean;
}

export function ProductCatalog({
  onSelectProduct,
  refreshKey = 0,
  isSyncingCatalog = false,
  quickMode = false,
}: ProductCatalogProps) {
  const { addToCart, cart } = usePOS();
  const { currency, business } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [clientUrl, setClientUrl] = useState<string | null>(null);
  const activeSearchRequestRef = useRef(0);
  const previousQuickModeRef = useRef(quickMode);
  const lastAutoScanNeedleRef = useRef<string | null>(null);
  const autoScanResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isSalesBusiness = isSalesBusinessAccountType(business?.account_type);
  const resolvedSelectedCategory =
    isSalesBusiness && selectedCategory === "Services"
      ? "Products"
      : selectedCategory;

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setClientUrl(Storage.getItem(STORAGE_KEYS.clientUrl));
      const productsData = await getProducts();
      const servicesData = isSalesBusiness ? [] : await getServices();
      console.info(`${LOG_PREFIX} ProductCatalog loadData`, {
        refreshKey,
        isSalesBusiness,
        products: productsData.length,
        services: servicesData.length,
        productsWithBarcode: productsData.filter((product) =>
          Boolean(product.barcode?.trim()),
        ).length,
        sampleProduct: productsData[0]
          ? {
              id: productsData[0].id,
              name: productsData[0].name,
              sku: productsData[0].sku,
              barcode: productsData[0].barcode,
            }
          : null,
      });

      if (!isMounted) return;
      setProducts(productsData);
      setServices(servicesData);
      setIsLoading(false);
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [isSalesBusiness, refreshKey]);

  useEffect(
    () => () => {
      if (autoScanResetTimerRef.current) {
        clearTimeout(autoScanResetTimerRef.current);
      }
    },
    [],
  );

  const loadCatalogForQuery = useCallback(
    async (query: string, requestId: number) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        const normalizedNeedle = normalizeBarcodeIdentifier(trimmedQuery);
        const isLikelyBarcodeLookup =
          quickMode && /^\d+$/.test(normalizedNeedle);
        const productResults = isLikelyBarcodeLookup
          ? (await getProducts()).filter((product) =>
              isExactScanMatch(normalizedNeedle, product.barcode),
            )
          : await searchProducts(query);
        if (requestId !== activeSearchRequestRef.current) return;
        const serviceResults = isLikelyBarcodeLookup
          ? []
          : isSalesBusiness
            ? []
            : (await getServices()).filter((service) =>
                service.name.toLowerCase().includes(trimmedQuery.toLowerCase()),
              );
        if (requestId !== activeSearchRequestRef.current) return;

        console.info(`${LOG_PREFIX} ProductCatalog search results`, {
          query,
          isLikelyBarcodeLookup,
          products: productResults.length,
          services: serviceResults.length,
          matchedBarcodes: productResults.filter((product) =>
            isExactScanMatch(normalizedNeedle, product.barcode),
          ).length,
        });
        setProducts(productResults);
        setServices(serviceResults);
        return;
      }

      const productsData = await getProducts();
      if (requestId !== activeSearchRequestRef.current) return;
      const servicesData = isSalesBusiness ? [] : await getServices();
      if (requestId !== activeSearchRequestRef.current) return;
      console.info(`${LOG_PREFIX} ProductCatalog search reset`, {
        products: productsData.length,
        services: servicesData.length,
      });
      setProducts(productsData);
      setServices(servicesData);
    },
    [isSalesBusiness, quickMode],
  );

  useEffect(() => {
    const wasQuickMode = previousQuickModeRef.current;
    previousQuickModeRef.current = quickMode;

    if (!quickMode && wasQuickMode) {
      const requestId = ++activeSearchRequestRef.current;
      void loadCatalogForQuery(searchQuery, requestId);
    }
  }, [loadCatalogForQuery, quickMode, searchQuery]);

  const handleSearch = async (query: string) => {
    const requestId = ++activeSearchRequestRef.current;
    setSearchQuery(query);
    const trimmedQuery = query.trim();
    const normalizedNeedle = normalizeBarcodeIdentifier(trimmedQuery);
    const isNumericBarcodeInput = quickMode && /^\d+$/.test(normalizedNeedle);
    console.info(`${LOG_PREFIX} ProductCatalog search`, {
      query,
      selectedCategory: resolvedSelectedCategory,
      isSalesBusiness,
      isNumericBarcodeInput,
    });
    if (trimmedQuery) {
      const allProducts = await getProducts();
      if (requestId !== activeSearchRequestRef.current) return;
      const exactBarcodeMatches = allProducts.filter((product) =>
        isExactScanMatch(normalizedNeedle, product.barcode),
      );
      console.info(`${LOG_PREFIX} ProductCatalog exact scan matches`, {
        query: trimmedQuery,
        normalizedNeedle,
        exactBarcodeMatches: exactBarcodeMatches.length,
        isNumericBarcodeInput,
        sample: exactBarcodeMatches[0]
          ? {
              id: exactBarcodeMatches[0].id,
              name: exactBarcodeMatches[0].name,
              barcode: exactBarcodeMatches[0].barcode,
              sku: exactBarcodeMatches[0].sku,
            }
          : null,
      });

      if (isNumericBarcodeInput) {
        if (exactBarcodeMatches.length === 1) {
          const isDuplicateScan =
            lastAutoScanNeedleRef.current === normalizedNeedle;
          if (isDuplicateScan) {
            return;
          }
          lastAutoScanNeedleRef.current = normalizedNeedle;
          if (autoScanResetTimerRef.current) {
            clearTimeout(autoScanResetTimerRef.current);
          }
          autoScanResetTimerRef.current = setTimeout(() => {
            lastAutoScanNeedleRef.current = null;
            autoScanResetTimerRef.current = null;
          }, 350);
          handleAddToCart(exactBarcodeMatches[0], { fromScanner: true });
          setSearchQuery("");
          await loadCatalogForQuery("", requestId);
          return;
        }

        setProducts(exactBarcodeMatches);
        setServices([]);
        return;
      }

      await loadCatalogForQuery(query, requestId);
    } else {
      await loadCatalogForQuery("", requestId);
    }
  };

  const handleAddToCart = (
    product: Product,
    options?: { fromScanner?: boolean },
  ) => {
    if (product.stock <= 0) {
      toast.error("Out of stock");
      return;
    }

    const addedQuantity = options?.fromScanner ? 1 : Math.min(1, product.stock);

    const existingQuantity = cart.find(
      (entry) => entry.productId === product.id,
    )?.quantity;
    const nextQuantity = (existingQuantity ?? 0) + addedQuantity;
    if (nextQuantity > product.stock) {
      toast.error(
        `Only ${formatQuantity(product.stock)} units available for ${product.name}.`,
      );
      return;
    }

    addToCart({
      id: product.id,
      productId: product.id,
      name: product.name,
      quantity: addedQuantity,
      price: product.price,
      tax: product.tax,
      subtotal: product.price * addedQuantity,
    });

    toast.success(`Added ${product.name} to cart`);
    onSelectProduct?.(product);
  };

  const handleAddServiceToCart = (service: Service) => {
    addToCart({
      id: service.id,
      serviceId: service.id,
      name: service.name,
      quantity: 1,
      price: service.price,
      tax: service.tax,
      subtotal: service.price,
    });

    toast.success(`Added ${service.name} to cart`);
  };

  const categories = isSalesBusiness
    ? ["All", "Products"]
    : ["All", "Products", "Services"];
  const displayedItems = {
    products:
      resolvedSelectedCategory === "All" ||
      resolvedSelectedCategory === "Products"
        ? products
        : [],
    services: isSalesBusiness
      ? []
      : resolvedSelectedCategory === "All" ||
          resolvedSelectedCategory === "Services"
        ? services
        : [],
  };
  const quickModeRows = [
    ...products.map((product) => ({
      id: `product-${product.id}`,
      name: product.name,
      type: "Product" as const,
      category: product.category || "Uncategorized",
      barcode: product.barcode ?? "",
      price: product.price,
      stockLabel: `${formatQuantity(product.stock)} in stock`,
      canAdd: product.stock > 0,
      onAdd: () => handleAddToCart(product),
    })),
    ...services.map((service) => ({
      id: `service-${service.id}`,
      name: service.name,
      type: "Service" as const,
      category: "Service",
      barcode: "",
      price: service.price,
      stockLabel: "Available",
      canAdd: true,
      onAdd: () => handleAddServiceToCart(service),
    })),
  ].sort((left, right) => left.name.localeCompare(right.name));

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={
              quickMode
                ? "Search products or services..."
                : "Search products..."
            }
            value={searchQuery}
            onChange={(e) => {
              void handleSearch(e.target.value);
            }}
            onKeyDown={(event) => {
              if (!quickMode || event.key !== "Enter") return;
              event.preventDefault();
              void handleSearch(searchQuery);
            }}
            className="pl-10"
          />
        </div>

        {/* Category Tabs */}
        {!quickMode && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  void handleSearch("");
                }}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                  resolvedSelectedCategory === cat
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products/Services Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-slate-500">
              {isSyncingCatalog ? "Syncing catalog..." : "Loading..."}
            </p>
          </div>
        ) : quickMode && !searchQuery.trim() ? (
          <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-slate-300 bg-slate-50">
            <p className="text-slate-500 text-sm">
              Scan a barcode or search to load items
            </p>
          </div>
        ) : quickMode ? (
          quickModeRows.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-slate-500">No items found</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quickModeRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[280px]">
                        <p className="truncate font-medium text-slate-900">
                          {row.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {row.category}
                        </p>
                      </TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.barcode || "-"}</TableCell>
                      <TableCell>
                        {formatCurrency(row.price, currency)}
                      </TableCell>
                      <TableCell>{row.stockLabel}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={row.onAdd}
                          disabled={!row.canAdd}
                          size="sm"
                          className="h-8 bg-blue-600 hover:bg-blue-700"
                        >
                          <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : displayedItems.products.length === 0 &&
          displayedItems.services.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-slate-500">No items found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Products Section */}
            {displayedItems.products.length > 0 && (
              <div>
                {resolvedSelectedCategory === "All" && (
                  <h3 className="font-semibold text-slate-700 mb-3 text-sm">
                    Products
                  </h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedItems.products.map((product) => (
                    <div
                      key={product.id}
                      className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <CatalogCardImage
                        imageValue={product.image}
                        alt={product.name}
                        kind="product"
                        baseUrl={clientUrl}
                      />

                      {/* Product Info */}
                      <div className="p-3">
                        <h3 className="font-semibold text-sm text-slate-900 truncate">
                          {product.name}
                        </h3>
                        <p className="text-xs text-slate-500 mb-2">Product</p>

                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold text-blue-600">
                            {formatCurrency(product.price, currency)}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              product.stock > 0
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {product.stock > 0
                              ? `${formatQuantity(product.stock)} in stock`
                              : "Out"}
                          </span>
                        </div>

                        <Button
                          onClick={() => handleAddToCart(product)}
                          disabled={product.stock <= 0}
                          className="w-full h-9 bg-blue-600 hover:bg-blue-700"
                          size="sm"
                        >
                          <ShoppingCart className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Services Section */}
            {displayedItems.services.length > 0 && (
              <div>
                {resolvedSelectedCategory === "All" && (
                  <h3 className="font-semibold text-slate-700 mb-3 text-sm">
                    Services
                  </h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedItems.services.map((service) => (
                    <div
                      key={service.id}
                      className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <CatalogCardImage
                        imageValue={service.image}
                        alt={service.name}
                        kind="service"
                        baseUrl={clientUrl}
                      />

                      {/* Service Info */}
                      <div className="p-3">
                        <h3 className="font-semibold text-sm text-slate-900 truncate">
                          {service.name}
                        </h3>
                        <p className="text-xs text-slate-500 mb-2">Service</p>

                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold text-blue-600">
                            {formatCurrency(service.price, currency)}
                          </span>
                        </div>

                        <Button
                          onClick={() => handleAddServiceToCart(service)}
                          className="w-full h-9 bg-blue-600 hover:bg-blue-700"
                          size="sm"
                        >
                          <ShoppingCart className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
