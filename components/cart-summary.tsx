"use client";

import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

interface CartSummaryProps {
  onCheckout: () => void;
  onSaveDraft: () => void;
  checkoutDisabled?: boolean;
}

export function CartSummary({
  onCheckout,
  onSaveDraft,
  checkoutDisabled = false,
}: CartSummaryProps) {
  const { currency } = useAuth();
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
  } = usePOS();

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
      </div>
    </div>
  );
}
