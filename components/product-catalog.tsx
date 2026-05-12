"use client";

import { useEffect, useState } from "react";
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
import { formatQuantity, toPositiveQuantity } from "@/lib/quantity";
import { resolveImageUri } from "@/lib/resolve-image-uri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Search } from "lucide-react";
import productFallbackImage from "@/assets/images/empty/product.png";
import serviceFallbackImage from "@/assets/images/empty/service.png";
import { toast } from "sonner";

const LOG_PREFIX = "[CatalogSync]";

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
}

export function ProductCatalog({
  onSelectProduct,
  refreshKey = 0,
  isSyncingCatalog = false,
}: ProductCatalogProps) {
  const { addToCart, cart } = usePOS();
  const { currency, business } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [clientUrl, setClientUrl] = useState<string | null>(null);
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

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    console.info(`${LOG_PREFIX} ProductCatalog search`, {
      query,
      selectedCategory: resolvedSelectedCategory,
      isSalesBusiness,
    });
    if (query.trim()) {
      const productResults = await searchProducts(query);
      const serviceResults = isSalesBusiness
        ? []
        : (await getServices()).filter((service) =>
            service.name.toLowerCase().includes(query.trim().toLowerCase()),
          );
      console.info(`${LOG_PREFIX} ProductCatalog search results`, {
        query,
        products: productResults.length,
        services: serviceResults.length,
      });
      setProducts(productResults);
      setServices(serviceResults);
    } else {
      const productsData = await getProducts();
      const servicesData = isSalesBusiness ? [] : await getServices();
      console.info(`${LOG_PREFIX} ProductCatalog search reset`, {
        products: productsData.length,
        services: servicesData.length,
      });
      setProducts(productsData);
      setServices(servicesData);
    }
  };

  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Out of stock");
      return;
    }

    const addedQuantity = toPositiveQuantity(Math.min(1, product.stock), 1);

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

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setSearchQuery("");
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
      </div>

      {/* Products/Services Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-slate-500">
              {isSyncingCatalog ? "Syncing catalog..." : "Loading..."}
            </p>
          </div>
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
