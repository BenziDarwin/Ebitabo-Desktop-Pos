"use client";

import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, getCurrencyMarker } from "@/lib/format-currency";
import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react";

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

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Order Summary
        </h2>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-center">
            <p className="text-slate-500">No items in cart</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => (
              <div
                key={item.id}
                className="bg-slate-50 rounded-lg p-3 border border-slate-200"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900">
                      {item.name}
                    </h4>
                    <div className="mt-1">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
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
                        className="h-8 w-28 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => removeFromCart(item.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-white rounded border border-slate-200">
                    <Button
                      onClick={() =>
                        updateCartItem(item.id, Math.max(1, item.quantity - 1))
                      }
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateCartItem(item.id, parseInt(e.target.value) || 1)
                      }
                      className="w-10 text-center text-sm font-semibold border-0 focus:ring-0"
                    />
                    <Button
                      onClick={() => updateCartItem(item.id, item.quantity + 1)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(item.subtotal, currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-slate-200 p-4 space-y-4">
        {/* Subtotal */}
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(cartSubtotal, currency)}</span>
        </div>

        {/* Discount */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Discount</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={discount || ""}
              onChange={handleDiscountChange}
              placeholder="0"
              className="flex-1"
            />
            <Button
              onClick={toggleDiscountType}
              variant="outline"
              className="px-3"
              size="sm"
            >
              {discountType === "amount" ? getCurrencyMarker(currency) : "%"}
            </Button>
          </div>
        </div>

        {/* Tax */}
        <div className="flex justify-between text-sm text-slate-600">
          <span>Tax</span>
          <span>{formatCurrency(cartTax, currency)}</span>
        </div>

        {/* Total */}
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-slate-900">Total</span>
            <span className="text-2xl font-bold text-blue-600">
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
            className="h-10"
          >
            Save Draft
          </Button>
          <Button
            onClick={onCheckout}
            disabled={cart.length === 0 || checkoutDisabled}
            className="h-10 bg-green-600 hover:bg-green-700"
          >
            Create Sale
          </Button>
        </div>
      </div>
    </div>
  );
}
