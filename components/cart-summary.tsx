"use client";

import { useEffect, useState } from "react";
import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency, getCurrencyMarker } from "@/lib/format-currency";
import {
  formatQuantity,
  QUANTITY_STEP,
  toNonNegativeQuantity,
} from "@/lib/quantity";
import {
  clampCartItemQuantityToStock,
  formatStockQuantity,
  getLocalProductStockMap,
  resolveMaxAllowedQuantity,
} from "@/services/cart-stock-service";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  FileText,
  History,
} from "lucide-react";
import { getOrderHistory } from "@/services/history-service";
import type { CompletedOrder } from "@/lib/types";
import { toast } from "sonner";

interface CartSummaryProps {
  onCheckout: () => void;
  onSaveDraft: () => void;
  checkoutDisabled?: boolean;
  quickMode?: boolean;
}

export function CartSummary({
  onCheckout,
  onSaveDraft,
  checkoutDisabled = false,
  quickMode = false,
}: CartSummaryProps) {
  const router = useRouter();
  const { currency, user } = useAuth();
  const {
    cart,
    removeFromCart,
    updateCartItem,
    updateCartItemPrice,
    cartSubtotal,
    cartTax,
    cartTotal,
    discount,
    discountType,
    setDiscount,
    orderDrafts,
    loadOrderDraft,
  } = usePOS();
  const [showDraftsDialog, setShowDraftsDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyOrders, setHistoryOrders] = useState<CompletedOrder[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!showHistoryDialog) return;

    let isMounted = true;
    const loadHistoryOrders = async () => {
      setIsLoadingHistory(true);
      try {
        const orders = await getOrderHistory(60);
        if (!isMounted) return;
        const scopedOrders = user?.id
          ? orders.filter((order) => order.userId === user.id)
          : orders;
        const sortedOrders = [...scopedOrders].sort(
          (left, right) =>
            new Date(right.completedAt).getTime() -
            new Date(left.completedAt).getTime(),
        );
        setHistoryOrders(sortedOrders);
      } catch (error) {
        console.error("Failed to load history orders", error);
        toast.error("Failed to load history orders");
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadHistoryOrders();

    return () => {
      isMounted = false;
    };
  }, [showHistoryDialog, user?.id]);

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setDiscount(value, discountType);
  };

  const toggleDiscountType = () => {
    setDiscount(discount, discountType === "amount" ? "percent" : "amount");
  };

  const handleUnitPriceChange = (itemId: string, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    updateCartItemPrice(itemId, Number.isFinite(parsed) ? parsed : 0);
  };

  const stockByProductId = getLocalProductStockMap();

  const normalizeQuantityInput = (rawValue: string): number => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return 0;
    return toNonNegativeQuantity(parsed);
  };

  const updateQuantityWithStockCheck = (
    itemId: string,
    nextQuantity: number,
  ) => {
    const item = cart.find((entry) => entry.id === itemId);
    if (!item) return;

    const clampedQuantity = clampCartItemQuantityToStock(
      item,
      nextQuantity,
      stockByProductId,
    );
    updateCartItem(itemId, clampedQuantity);

    const maxAllowed = resolveMaxAllowedQuantity(item, stockByProductId);
    if (maxAllowed !== null && nextQuantity > maxAllowed) {
      toast.error(
        `Only ${formatStockQuantity(maxAllowed)} units available for ${item.name}.`,
      );
    }
  };

  const handleLoadDraftFromQuickMode = (draftId: string) => {
    loadOrderDraft(draftId);
    setShowDraftsDialog(false);
    toast.success("Draft loaded");
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          Order Summary
        </h2>
      </div>

      {/* Items */}
      {!quickMode && (
        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-center">
              <p className="text-slate-500">No items in cart</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-50 rounded-lg p-2 border border-slate-200"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-900">
                        {item.name}
                      </h4>
                      <div className="mt-0.5">
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Unit Price
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.price}
                          onChange={(e) =>
                            handleUnitPriceChange(item.id, e.target.value)
                          }
                          className="h-7 w-24 text-xs"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => removeFromCart(item.id)}
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-white rounded border border-slate-200">
                      <Button
                        onClick={() =>
                          updateQuantityWithStockCheck(
                            item.id,
                            Math.max(0, item.quantity - QUANTITY_STEP),
                          )
                        }
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <input
                        type="number"
                        min={0}
                        step={QUANTITY_STEP}
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantityWithStockCheck(
                            item.id,
                            normalizeQuantityInput(e.target.value),
                          )
                        }
                        className="w-14 text-center text-xs font-semibold border-0 focus:ring-0"
                      />
                      <Button
                        onClick={() =>
                          updateQuantityWithStockCheck(
                            item.id,
                            item.quantity + QUANTITY_STEP,
                          )
                        }
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(item.subtotal, currency)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Qty: {formatQuantity(item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-slate-200 p-3 space-y-2.5">
        {/* Subtotal */}
        <div className="flex justify-between text-xs text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(cartSubtotal, currency)}</span>
        </div>

        {/* Discount */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">Discount</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={discount || ""}
              onChange={handleDiscountChange}
              placeholder="0"
              className="h-8 flex-1 text-xs"
            />
            <Button
              onClick={toggleDiscountType}
              variant="outline"
              className="h-8 px-2.5 text-xs"
              size="sm"
            >
              {discountType === "amount" ? getCurrencyMarker(currency) : "%"}
            </Button>
          </div>
        </div>

        {/* Tax */}
        <div className="flex justify-between text-xs text-slate-600">
          <span>Tax</span>
          <span>{formatCurrency(cartTax, currency)}</span>
        </div>

        {/* Total */}
        <div className="bg-blue-50 rounded-lg p-2">
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-slate-900">Total</span>
            <span className="text-xl font-bold text-blue-600">
              {formatCurrency(cartTotal, currency)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={onSaveDraft}
            disabled={cart.length === 0}
            variant="outline"
            className="h-9 text-xs"
          >
            Save Draft
          </Button>
          <Button
            onClick={onCheckout}
            disabled={cart.length === 0 || checkoutDisabled}
            className="h-9 text-xs bg-green-600 hover:bg-green-700"
          >
            Create Sale
          </Button>
        </div>

        {quickMode && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => setShowDraftsDialog(true)}
              variant="outline"
              className="h-9 text-xs"
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Drafts
            </Button>
            <Button
              onClick={() => setShowHistoryDialog(true)}
              variant="outline"
              className="h-9 text-xs"
            >
              <History className="h-3.5 w-3.5 mr-1" />
              History
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showDraftsDialog} onOpenChange={setShowDraftsDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Drafts</DialogTitle>
            <DialogDescription>
              Continue any saved draft directly from quick mode.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            {orderDrafts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No drafts found.
              </div>
            ) : (
              <div className="space-y-3">
                {orderDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-slate-200 p-3 bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {draft.notes || `Draft ${draft.id.slice(-8)}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(draft.updatedAt).toLocaleDateString()}{" "}
                          {new Date(draft.updatedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 h-8"
                        onClick={() => handleLoadDraftFromQuickMode(draft.id)}
                      >
                        Load
                      </Button>
                    </div>

                    <div className="mt-2 space-y-1">
                      {draft.items.slice(0, 4).map((item) => (
                        <p
                          key={`${draft.id}-${item.id}`}
                          className="text-xs text-slate-700"
                        >
                          {item.name} x{formatQuantity(item.quantity)}
                        </p>
                      ))}
                      {draft.items.length > 4 && (
                        <p className="text-xs text-slate-500">
                          +{draft.items.length - 4} more
                        </p>
                      )}
                    </div>

                    <div className="mt-2 text-xs font-semibold text-blue-700">
                      Total: {formatCurrency(draft.total, currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => router.push("/orders")}>
              Open full drafts page
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
            <DialogDescription>
              Recent completed sales from this device.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            {isLoadingHistory ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Loading history...
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No history found.
              </div>
            ) : (
              <div className="space-y-3">
                {historyOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-slate-200 p-3 bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {order.notes || `Sale ${order.id.slice(-8)}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(order.completedAt).toLocaleDateString()}{" "}
                          {new Date(order.completedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className="text-[11px] rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-600">
                        {order.sync.status}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1">
                      {order.items.slice(0, 4).map((item) => (
                        <p
                          key={`${order.id}-${item.id}`}
                          className="text-xs text-slate-700"
                        >
                          {item.name} x{formatQuantity(item.quantity)}
                        </p>
                      ))}
                      {order.items.length > 4 && (
                        <p className="text-xs text-slate-500">
                          +{order.items.length - 4} more
                        </p>
                      )}
                    </div>

                    <div className="mt-2 text-xs font-semibold text-blue-700">
                      Total: {formatCurrency(order.total, currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => router.push("/history")}>
              Open full history page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
