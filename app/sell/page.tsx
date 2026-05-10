"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { completeOrder } from "@/services/order-service";
import { syncCatalogFromCloud } from "@/services/catalog-service";
import {
  createSaleFromCart,
  fetchBusinessClients,
  type SalePaymentMethod,
} from "@/services/sales-service";
import { POSLayout } from "@/components/pos-layout";
import { ProductCatalog } from "@/components/product-catalog";
import { CartSummary } from "@/components/cart-summary";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, getCurrencyMarker } from "@/lib/format-currency";
import { toast } from "sonner";
import type { Client, OrderDraft } from "@/lib/types";

const LOG_PREFIX = "[CatalogSync]";
const PAYMENT_METHODS: SalePaymentMethod[] = [
  "Cash",
  "Mobile Money",
  "Bank Transfer",
  "Debit/Credit Card",
  "Advance",
];

export default function SellPage() {
  const { user, business, currency, isReady, isAuthenticated } = useAuth();
  const {
    cart,
    cartSubtotal,
    cartTax,
    cartTotal,
    discount,
    discountType,
    selectedClient,
    setSelectedClient,
    orderNotes,
    activeDraftId,
    orderDrafts,
    saveOrderDraft,
    clearCart,
  } = usePOS();

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("Cash");
  const [amountPaid, setAmountPaid] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [isCatalogSyncing, setIsCatalogSyncing] = useState(false);
  const isSyncInFlight = useRef(false);
  const hasPendingSync = useRef(false);
  const pendingSyncReason = useRef<string | null>(null);

  const runCatalogSync = async (reason: string) => {
    console.info(`${LOG_PREFIX} runCatalogSync requested`, {
      reason,
      isSyncInFlight: isSyncInFlight.current,
    });
    if (isSyncInFlight.current) {
      hasPendingSync.current = true;
      pendingSyncReason.current = reason;
      return;
    }

    isSyncInFlight.current = true;
    setIsCatalogSyncing(true);
    try {
      const result = await syncCatalogFromCloud();
      console.info(`${LOG_PREFIX} runCatalogSync success`, {
        reason,
        products: result.products,
        services: result.services,
        syncedAt: result.syncedAt.toISOString(),
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} runCatalogSync failed`, {
        reason,
        error,
      });
    } finally {
      isSyncInFlight.current = false;
      setCatalogRefreshKey((previous) => previous + 1);
      setIsCatalogSyncing(false);

      if (hasPendingSync.current) {
        hasPendingSync.current = false;
        const queuedReason = pendingSyncReason.current ?? "queued";
        pendingSyncReason.current = null;
        void runCatalogSync(queuedReason);
      }
    }
  };

  useEffect(() => {
    // Always trigger sync when the sell page mounts.
    void runCatalogSync("mount");
    // runCatalogSync intentionally omitted; refs keep sync state fresh here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.info(`${LOG_PREFIX} auth state changed`, {
      isReady,
      isAuthenticated,
    });
    if (!isReady || !isAuthenticated) return;

    // Re-run after auth/session context is restored.
    void runCatalogSync("auth-ready");
    // runCatalogSync intentionally omitted; refs keep sync state fresh here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isReady]);

  const loadClients = useCallback(async () => {
    if (!business) {
      setClients([]);
      return;
    }

    setIsLoadingClients(true);
    try {
      const fetchedClients = await fetchBusinessClients(business.account_type);
      setClients(fetchedClients);

      if (selectedClient) {
        const nextSelectedClient = fetchedClients.find(
          (entry) => entry.id === selectedClient.id,
        );
        setSelectedClient(nextSelectedClient ?? null);
      }
    } catch (error) {
      console.error("Failed to load clients", error);
      toast.error("Failed to load clients for sale");
    } finally {
      setIsLoadingClients(false);
    }
  }, [business, selectedClient, setSelectedClient]);

  const filteredClients = useMemo(() => {
    const needle = clientSearch.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) =>
      client.name.toLowerCase().includes(needle),
    );
  }, [clientSearch, clients]);

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setAmountPaid(cartTotal);
    setShowPaymentDialog(true);
    void loadClients();
  };

  const handleCompletePayment = async () => {
    if (!business) {
      toast.error("Business details not loaded. Please login again.");
      return;
    }

    if (!selectedClient) {
      toast.error("Please select a client before creating a sale.");
      return;
    }

    if (amountPaid < cartTotal) {
      toast.error("Insufficient payment amount");
      return;
    }

    if (
      paymentMethod === "Advance" &&
      (selectedClient.advancedAmount ?? 0) < cartTotal
    ) {
      toast.error("Client advance amount is not enough for this sale.");
      return;
    }

    const userId = user?.id ?? business?.userId;
    if (!userId) {
      toast.error("No active user session. Please login again.");
      return;
    }

    const resolvedCurrencyId = Number(
      currency?.id ?? business.currency_id ?? 0,
    );
    const change = amountPaid - cartTotal;

    setIsCreatingSale(true);
    let remoteCreateFailed = false;

    try {
      await createSaleFromCart({
        business,
        cart,
        client: selectedClient,
        paymentMethod,
        amountPaid,
        currencyId: resolvedCurrencyId,
        subtotal: cartSubtotal,
        discount,
        discountType,
        createdBy: user?.name || user?.username,
      });
    } catch (error) {
      remoteCreateFailed = true;
      console.error("createSaleFromCart failed", error);
    }

    const checkoutDraft: OrderDraft = {
      id: `sale-${Date.now()}`,
      items: cart,
      client: selectedClient || undefined,
      subtotal: cartSubtotal,
      tax: cartTax,
      total: cartTotal,
      discount,
      discountType,
      notes: orderNotes,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId,
    };

    try {
      await completeOrder(checkoutDraft, userId);
    } catch (error) {
      console.error("Failed to persist local sale", error);
      toast.error("Failed to save sale locally. Please try again.");
      setIsCreatingSale(false);
      return;
    }

    if (remoteCreateFailed) {
      toast.warning(
        "Sale saved locally, but cloud create-sale failed. Check network/API and sync again.",
      );
    } else {
      toast.success(
        `Sale created successfully. Change: ${formatCurrency(change, currency)}`,
      );
    }

    setShowPaymentDialog(false);
    clearCart();
    setAmountPaid(0);
    setPaymentMethod("Cash");
    setClientSearch("");
    setIsCreatingSale(false);
  };

  const handleSaveDraft = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    const activeDraft = activeDraftId
      ? orderDrafts.find((draft) => draft.id === activeDraftId)
      : null;

    const draft: OrderDraft = {
      id: activeDraft?.id ?? `draft-${Date.now()}`,
      items: cart,
      client: selectedClient || undefined,
      subtotal: cartSubtotal,
      tax: cartTax,
      total: cartTotal,
      discount,
      discountType,
      notes: orderNotes || activeDraft?.notes || undefined,
      createdAt: activeDraft?.createdAt ?? new Date(),
      updatedAt: new Date(),
      userId: user?.id || business?.userId || "",
    };

    saveOrderDraft(draft);
    toast.success(activeDraft ? "Draft updated" : "Draft saved");
    clearCart();
  };

  return (
    <POSLayout currentPage="sell">
      <div className="h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-4 p-4 bg-slate-50">
        {/* Product Catalog */}
        <div className="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-w-0 lg:h-auto h-1/2">
          <ProductCatalog
            refreshKey={catalogRefreshKey}
            isSyncingCatalog={isCatalogSyncing}
          />
        </div>

        {/* Right Sidebar - Cart & Checkout */}
        <div className="w-full lg:w-96 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col lg:h-auto h-1/2">
          <CartSummary
            onCheckout={handleCheckout}
            onSaveDraft={handleSaveDraft}
            checkoutDisabled={cart.length === 0}
          />
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Sale</DialogTitle>
            <DialogDescription>
              Total amount: {formatCurrency(cartTotal, currency)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Client Selection */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Client
              </label>
              <Input
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Type to search clients..."
                className="mb-2"
              />
              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
                {isLoadingClients ? (
                  <p className="p-3 text-sm text-slate-500">
                    Loading clients...
                  </p>
                ) : filteredClients.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">No clients found</p>
                ) : (
                  filteredClients.map((client) => {
                    const isActive = selectedClient?.id === client.id;
                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClient(client);
                          setClientSearch("");
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{client.name}</span>
                          {client.advancedAmount ? (
                            <span className="text-xs text-slate-500">
                              Adv:{" "}
                              {formatCurrency(client.advancedAmount, currency)}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedClient && (
                <p className="mt-2 text-xs text-green-700">
                  Selected: {selectedClient.name}
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.filter((method) => {
                  if (method !== "Advance") return true;
                  return (selectedClient?.advancedAmount ?? 0) > 0;
                }).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`p-3 rounded-lg border-2 font-medium capitalize transition-colors ${
                      paymentMethod === method
                        ? "border-blue-600 bg-blue-50 text-blue-600"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
              {paymentMethod === "Advance" && selectedClient && (
                <p className="mt-2 text-xs text-blue-700">
                  Advance available:{" "}
                  {formatCurrency(selectedClient.advancedAmount ?? 0, currency)}
                </p>
              )}
            </div>

            {/* Amount Paid */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Amount Paid
              </label>
              <Input
                type="number"
                value={amountPaid || ""}
                onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="text-lg"
              />
            </div>

            {/* Order Summary */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-medium">
                  {formatCurrency(cartSubtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Tax:</span>
                <span className="font-medium">
                  {formatCurrency(cartTax, currency)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>
                    Discount (
                    {discountType === "percent"
                      ? "%"
                      : getCurrencyMarker(currency)}
                    ):
                  </span>
                  <span className="font-medium">
                    -
                    {formatCurrency(
                      discountType === "amount"
                        ? discount
                        : cartSubtotal * (discount / 100),
                      currency,
                    )}
                  </span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold">
                <span>Total:</span>
                <span className="text-blue-600">
                  {formatCurrency(cartTotal, currency)}
                </span>
              </div>

              {amountPaid >= cartTotal && (
                <div className="flex justify-between text-sm bg-green-50 p-2 rounded border border-green-200">
                  <span className="text-green-700">Change:</span>
                  <span className="font-semibold text-green-700">
                    {formatCurrency(amountPaid - cartTotal, currency)}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => setShowPaymentDialog(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCompletePayment}
                disabled={
                  isCreatingSale ||
                  !selectedClient ||
                  isLoadingClients ||
                  amountPaid < cartTotal
                }
                className="bg-green-600 hover:bg-green-700"
              >
                {isCreatingSale ? "Creating..." : "Create Sale"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </POSLayout>
  );
}
