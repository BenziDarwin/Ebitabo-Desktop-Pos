"use client";

import { useEffect, useState } from "react";
import { usePOS } from "@/lib/context/pos-context";
import { getProducts, searchProducts, getServices } from "@/lib/mock-api";
import type { Product, Service } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Search } from "lucide-react";
import { toast } from "sonner";

interface ProductCatalogProps {
  onSelectProduct?: (product: Product) => void;
}

export function ProductCatalog({ onSelectProduct }: ProductCatalogProps) {
  const { addToCart } = usePOS();
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [productsData, servicesData] = await Promise.all([
        getProducts(),
        getServices(),
      ]);
      setProducts(productsData);
      setServices(servicesData);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = await searchProducts(query);
      setProducts(results);
    } else {
      const data = await getProducts();
      setProducts(data);
    }
  };

  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Out of stock");
      return;
    }

    addToCart({
      id: product.id,
      productId: product.id,
      name: product.name,
      quantity: 1,
      price: product.price,
      tax: product.tax,
      subtotal: product.price,
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

  const categories = ["All", "Products", "Services"];
  const displayedItems = {
    products:
      selectedCategory === "All" || selectedCategory === "Products"
        ? products
        : [],
    services:
      selectedCategory === "All" || selectedCategory === "Services"
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
                selectedCategory === cat
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
            <p className="text-slate-500">Loading...</p>
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
                {selectedCategory === "All" && (
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
                      {/* Product Image Placeholder */}
                      <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <ShoppingCart className="w-8 h-8 text-slate-400" />
                      </div>

                      {/* Product Info */}
                      <div className="p-3">
                        <h3 className="font-semibold text-sm text-slate-900 truncate">
                          {product.name}
                        </h3>
                        <p className="text-xs text-slate-500 mb-2">Product</p>

                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold text-blue-600">
                            ${product.price.toFixed(2)}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              product.stock > 0
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {product.stock > 0
                              ? `${product.stock} in stock`
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
                {selectedCategory === "All" && (
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
                      {/* Service Image Placeholder */}
                      <div className="h-32 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                        <ShoppingCart className="w-8 h-8 text-blue-400" />
                      </div>

                      {/* Service Info */}
                      <div className="p-3">
                        <h3 className="font-semibold text-sm text-slate-900 truncate">
                          {service.name}
                        </h3>
                        <p className="text-xs text-slate-500 mb-2">Service</p>

                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-bold text-blue-600">
                            ${service.price.toFixed(2)}
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
