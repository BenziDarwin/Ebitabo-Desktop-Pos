"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { useQuickMode } from "@/provider/quick-mode-provider";
import { completeOrder } from "@/services/order-service";
import { syncCatalogFromCloud } from "@/services/catalog-service";
import {
  createSaleFromCart,
  extractRemoteSaleId,
  fetchBusinessClients,
  getCachedBusinessClients,
  type SalePaymentMethod,
} from "@/services/sales-service";
import { POSLayout } from "@/components/pos-layout";
import { ProductCatalog } from "@/components/product-catalog";
import { CartSummary } from "@/components/cart-summary";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency, getCurrencyMarker } from "@/lib/format-currency";
import { formatQuantity } from "@/lib/quantity";
import {
  findFirstInsufficientStock,
  formatStockQuantity,
  getLocalProductStockMap,
} from "@/services/cart-stock-service";
import { printReceiptWeb } from "@/lib/print-receipt";
import {
  isSubscriptionExpired,
  SUBSCRIPTION_EXPIRED_MESSAGE,
} from "@/lib/subscription";
import { resolveBusinessForSale } from "@/lib/sale-context";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import type { Client, CompletedOrder, OrderDraft } from "@/lib/types";

const LOG_PREFIX = "[CatalogSync]";
const PAYMENT_METHODS: SalePaymentMethod[] = [
  "Cash",
  "Mobile Money",
  "Bank Transfer",
  "Debit/Credit Card",
  "Advance",
];

function getSettlementAmounts(total: number, paid: number) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safePaid = Number.isFinite(paid) ? Math.max(0, paid) : 0;
  return {
    balanceDue: Math.max(0, safeTotal - safePaid),
    change: Math.max(0, safePaid - safeTotal),
  };
}

function resolveOrderAmountPaid(order: CompletedOrder): number {
  const amountPaid = Number(order.sync.amountPaid);
  if (Number.isFinite(amountPaid) && amountPaid >= 0) {
    return amountPaid;
  }
  const firstPaymentAmount = Number(order.payments[0]?.amount);
  if (Number.isFinite(firstPaymentAmount) && firstPaymentAmount >= 0) {
    return firstPaymentAmount;
  }
  return Math.max(0, order.total);
}

export default function SellPage() {
  const {
    user,
    business,
    currency,
    isReady,
    isAuthenticated,
    fetchBusinessDetails,
  } = useAuth();
  const { isQuickMode } = useQuickMode();
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
    deleteOrderDraft,
    clearCart,
  } = usePOS();

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("Cash");
  const [amountPaid, setAmountPaid] = useState(0);
  const amountPaidInputRef = useRef<HTMLInputElement | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [showQuickModeReceiptDialog, setShowQuickModeReceiptDialog] =
    useState(false);
  const [quickModeReceiptOrder, setQuickModeReceiptOrder] =
    useState<CompletedOrder | null>(null);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [isCatalogSyncing, setIsCatalogSyncing] = useState(false);
  const isSyncInFlight = useRef(false);
  const hasPendingSync = useRef(false);
  const pendingSyncReason = useRef<string | null>(null);
  const isCreateSaleInFlight = useRef(false);

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

    const reconcileSelectedClient = (nextClients: Client[]) => {
      if (!selectedClient) return;
      const nextSelectedClient = nextClients.find(
        (entry) => entry.id === selectedClient.id,
      );
      setSelectedClient(nextSelectedClient ?? null);
    };

    const cachedClients = getCachedBusinessClients(business.account_type);
    if (cachedClients.length > 0) {
      setClients(cachedClients);
      reconcileSelectedClient(cachedClients);
    }

    setIsLoadingClients(cachedClients.length === 0);
    try {
      const fetchedClients = await fetchBusinessClients(business.account_type);
      setClients(fetchedClients);
      reconcileSelectedClient(fetchedClients);
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

  const availablePaymentMethods = useMemo(
    () =>
      PAYMENT_METHODS.filter((method) => {
        if (method !== "Advance") return true;
        return (selectedClient?.advancedAmount ?? 0) > 0;
      }),
    [selectedClient],
  );
  const resolvedPaymentMethod = availablePaymentMethods.includes(paymentMethod)
    ? paymentMethod
    : "Cash";
  const { balanceDue: liveBalanceDue, change: liveChange } = useMemo(
    () => getSettlementAmounts(cartTotal, amountPaid),
    [amountPaid, cartTotal],
  );

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setAmountPaid(cartTotal);
    setShowPaymentDialog(true);
    setClientSearch("");
    void loadClients();
  };

  const resolveLatestAmountPaid = (): number => {
    const inputValue = amountPaidInputRef.current?.value;
    const parsed = Number(
      typeof inputValue === "string" && inputValue.trim() !== ""
        ? inputValue
        : amountPaid,
    );
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const handleCompletePayment = async () => {
    if (isCreateSaleInFlight.current) return;
    isCreateSaleInFlight.current = true;
    setIsCreatingSale(true);

    try {
      const resolvedBusiness = await resolveBusinessForSale({
        currentBusiness: business,
        refreshBusinessDetails: fetchBusinessDetails,
      });

      if (!resolvedBusiness) {
        toast.error("Business details not loaded. Please login again.");
        return;
      }

      if (isSubscriptionExpired(resolvedBusiness.dateExpiry)) {
        toast.error(SUBSCRIPTION_EXPIRED_MESSAGE);
        return;
      }

      if (!selectedClient) {
        toast.error("Please select a client before creating a sale.");
        return;
      }

      const stockIssue = findFirstInsufficientStock(
        cart,
        getLocalProductStockMap(),
      );
      if (stockIssue) {
        toast.error(
          `${stockIssue.itemName} exceeds stock. Available: ${formatStockQuantity(stockIssue.available)}, requested: ${formatQuantity(stockIssue.requested)}.`,
        );
        return;
      }

      if (
        resolvedPaymentMethod === "Advance" &&
        (selectedClient.advancedAmount ?? 0) < cartTotal
      ) {
        toast.error("Client advance amount is not enough for this sale.");
        return;
      }

      const userId = user?.id ?? resolvedBusiness.userId;
      if (!userId) {
        toast.error("No active user session. Please login again.");
        return;
      }

      const resolvedAmountPaid = resolveLatestAmountPaid();
      setAmountPaid(resolvedAmountPaid);
      const recordedAmountPaid = Math.min(resolvedAmountPaid, cartTotal);

      const resolvedCurrencyId = Number(
        currency?.id ?? resolvedBusiness.currency_id ?? 0,
      );
      const { balanceDue, change } = getSettlementAmounts(
        cartTotal,
        resolvedAmountPaid,
      );

      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      let remoteCreateFailed = isOffline;
      let remoteCreateError: string | null = isOffline
        ? "No internet connection."
        : null;
      let remoteSaleId: number | null = null;

      if (!isOffline) {
        try {
          const remoteResponse = await createSaleFromCart({
            business: resolvedBusiness,
            cart,
            client: selectedClient,
            paymentMethod: resolvedPaymentMethod,
            amountPaid: recordedAmountPaid,
            currencyId: resolvedCurrencyId,
            subtotal: cartSubtotal,
            discount,
            discountType,
            createdBy: user?.name || user?.username,
          });
          remoteSaleId = extractRemoteSaleId(remoteResponse);
        } catch (error) {
          remoteCreateFailed = true;
          remoteCreateError =
            error instanceof Error
              ? error.message
              : "Cloud create-sale failed. Please sync later.";
          console.error("createSaleFromCart failed", error);
        }
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

      let completedOrder: CompletedOrder;
      try {
        completedOrder = await completeOrder(checkoutDraft, userId, {
          change,
          payments: [
            {
              method: resolvedPaymentMethod,
              amount: recordedAmountPaid,
              date: new Date().toISOString(),
            },
          ],
          sync: {
            status: remoteCreateFailed ? "pending" : "synced",
            remoteSaleId,
            syncedAt: remoteCreateFailed ? null : new Date(),
            lastSyncError: remoteCreateFailed ? remoteCreateError : null,
            paymentMethod: resolvedPaymentMethod,
            amountPaid: recordedAmountPaid,
            currencyId: resolvedCurrencyId,
            businessAccountType: resolvedBusiness.account_type,
            businessUserId: resolvedBusiness.userId,
            createdBy: user?.name || user?.username,
          },
        });
      } catch (error) {
        console.error("Failed to persist local sale", error);
        toast.error("Failed to save sale locally. Please try again.");
        return;
      }

      if (remoteCreateFailed) {
        toast.warning("Sale saved locally as pending. Sync it from History.");
      } else {
        if (balanceDue > 0) {
          toast.success(
            `Sale created on credit. Balance due: ${formatCurrency(balanceDue, currency)}`,
          );
        } else {
          toast.success(
            `Sale created successfully. Change: ${formatCurrency(change, currency)}`,
          );
        }
      }

      if (activeDraftId) {
        deleteOrderDraft(activeDraftId);
      }

      setShowPaymentDialog(false);
      setIsClientPickerOpen(false);
      clearCart();
      setAmountPaid(0);
      setPaymentMethod("Cash");
      setClientSearch("");

      if (isQuickMode) {
        setQuickModeReceiptOrder(completedOrder);
        setShowQuickModeReceiptDialog(true);
      }
    } finally {
      isCreateSaleInFlight.current = false;
      setIsCreatingSale(false);
    }
  };

  const handlePrintQuickModeReceipt = () => {
    if (!quickModeReceiptOrder) return;
    const amountPaid = resolveOrderAmountPaid(quickModeReceiptOrder);
    const balance = quickModeReceiptOrder.total - amountPaid;
    const opened = printReceiptWeb({
      items: quickModeReceiptOrder.items,
      total: quickModeReceiptOrder.total,
      currency: currency?.name ?? "",
      receiptNumber: quickModeReceiptOrder.id,
      amountPaid,
      balance,
      createdBy:
        quickModeReceiptOrder.sync.createdBy ??
        user?.name ??
        user?.username ??
        undefined,
      type: "Sale",
      timestamp: new Date(quickModeReceiptOrder.completedAt),
      business,
    });
    if (!opened) {
      window.alert("Please allow pop-ups in your browser to print receipts.");
      return;
    }
    setShowQuickModeReceiptDialog(false);
    setQuickModeReceiptOrder(null);
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
      <div
        className={`h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-4 p-4 bg-slate-50`}
      >
        {/* Product Catalog */}
        <div className="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-w-0 lg:h-auto h-1/2">
          <ProductCatalog
            refreshKey={catalogRefreshKey}
            isSyncingCatalog={isCatalogSyncing}
            quickMode={isQuickMode}
          />
        </div>

        {/* Right Sidebar - Cart & Checkout */}
        <div className="w-full lg:w-96 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col lg:h-auto h-1/2">
          <CartSummary
            onCheckout={handleCheckout}
            onSaveDraft={handleSaveDraft}
            checkoutDisabled={cart.length === 0}
            quickMode={isQuickMode}
          />
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog
        open={showPaymentDialog}
        onOpenChange={(open) => {
          setShowPaymentDialog(open);
          if (!open) {
            setIsClientPickerOpen(false);
            setClientSearch("");
          }
        }}
      >
        <DialogContent className="flex w-[98vw] max-h-[90vh] flex-col overflow-hidden p-0 sm:w-[96vw] sm:max-w-[1280px] lg:max-w-[1440px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Create Sale</DialogTitle>
            <DialogDescription>
              Total amount: {formatCurrency(cartTotal, currency)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 pb-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {/* Client Selection */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">
                  Client
                </label>
                <Popover
                  open={isClientPickerOpen}
                  onOpenChange={setIsClientPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={isClientPickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedClient
                          ? selectedClient.name
                          : "Search and select client..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        value={clientSearch}
                        onValueChange={setClientSearch}
                        placeholder="Search clients..."
                      />
                      <CommandList>
                        {isLoadingClients ? (
                          <p className="p-3 text-sm text-slate-500">
                            Loading clients...
                          </p>
                        ) : (
                          <>
                            <CommandEmpty>No clients found</CommandEmpty>
                            <CommandGroup>
                              {filteredClients.map((client) => {
                                const isActive =
                                  selectedClient?.id === client.id;
                                return (
                                  <CommandItem
                                    key={client.id}
                                    value={`${client.name} ${client.id}`}
                                    onSelect={() => {
                                      setSelectedClient(client);
                                      setClientSearch("");
                                      setIsClientPickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        isActive ? "opacity-100" : "opacity-0"
                                      }`}
                                    />
                                    <div className="flex w-full items-center justify-between gap-2">
                                      <span className="truncate">
                                        {client.name}
                                      </span>
                                      {client.advancedAmount ? (
                                        <span className="text-xs text-slate-500 shrink-0">
                                          Adv:{" "}
                                          {formatCurrency(
                                            client.advancedAmount,
                                            currency,
                                          )}
                                        </span>
                                      ) : null}
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
                <Select
                  value={resolvedPaymentMethod}
                  onValueChange={(value) =>
                    setPaymentMethod(value as SalePaymentMethod)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePaymentMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {resolvedPaymentMethod === "Advance" && selectedClient && (
                  <p className="mt-2 text-xs text-blue-700">
                    Advance available:{" "}
                    {formatCurrency(
                      selectedClient.advancedAmount ?? 0,
                      currency,
                    )}
                  </p>
                )}
              </div>

              {/* Amount Paid */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">
                  Amount Paid
                </label>
                <Input
                  ref={amountPaidInputRef}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={amountPaid || ""}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    setAmountPaid(
                      Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
                    );
                  }}
                  placeholder="0.00"
                  className="text-lg"
                />
                {liveBalanceDue > 0 ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Balance due: {formatCurrency(liveBalanceDue, currency)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-600">No balance due</p>
                )}
                {liveChange > 0 ? (
                  <p className="mt-1 text-xs text-green-700">
                    Change: {formatCurrency(liveChange, currency)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
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

                {liveChange > 0 && (
                  <div className="flex justify-between text-sm bg-green-50 p-2 rounded border border-green-200">
                    <span className="text-green-700">Change:</span>
                    <span className="font-semibold text-green-700">
                      {formatCurrency(liveChange, currency)}
                    </span>
                  </div>
                )}
                {liveBalanceDue > 0 && (
                  <div className="flex justify-between text-sm bg-amber-50 p-2 rounded border border-amber-200">
                    <span className="text-amber-700">Balance Due:</span>
                    <span className="font-semibold text-amber-700">
                      {formatCurrency(liveBalanceDue, currency)}
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
                  disabled={isCreatingSale || !selectedClient}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isCreatingSale ? "Creating..." : "Create Sale"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showQuickModeReceiptDialog}
        onOpenChange={(open) => {
          setShowQuickModeReceiptDialog(open);
          if (!open) {
            setQuickModeReceiptOrder(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Receipt</DialogTitle>
            <DialogDescription>
              Sale was saved successfully. Print receipt now?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowQuickModeReceiptDialog(false);
                setQuickModeReceiptOrder(null);
              }}
            >
              Not now
            </Button>
            <Button onClick={handlePrintQuickModeReceipt}>Print Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </POSLayout>
  );
}
