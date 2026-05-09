"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePOS } from "@/lib/context/pos-context";
import { useAuth } from "@/lib/context/auth-context";
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
import type { Product } from "@/lib/types";
import { toast } from "sonner";

export default function SellPage() {
  const router = useRouter();
  const { user } = useAuth();
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
    setOrderNotes,
    saveOrderDraft,
    clearCart,
  } = usePOS();

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [amountPaid, setAmountPaid] = useState(0);

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setShowPaymentDialog(true);
  };

  const handleCompletePayment = async () => {
    // For this demo, we'll just show a success message and clear the cart
    const change = amountPaid - cartTotal;
    if (amountPaid < cartTotal) {
      toast.error("Insufficient payment amount");
      return;
    }

    toast.success(`Payment completed! Change: $${change.toFixed(2)}`);
    setShowPaymentDialog(false);
    clearCart();
    setAmountPaid(0);
    setPaymentMethod("cash");
  };

  const handleSaveDraft = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setShowDraftDialog(true);
  };

  const handleConfirmSaveDraft = () => {
    if (!draftName.trim()) {
      toast.error("Please enter a draft name");
      return;
    }

    const draft = {
      id: `draft-${Date.now()}`,
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
      userId: user?.id || "",
    };

    saveOrderDraft(draft);
    toast.success(`Draft "${draftName}" saved`);
    setShowDraftDialog(false);
    setDraftName("");
    clearCart();
  };

  return (
    <POSLayout currentPage="sell">
      <div className="h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-4 p-4 bg-slate-50">
        {/* Product Catalog */}
        <div className="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-w-0 lg:h-auto h-1/2">
          <ProductCatalog />
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
            <DialogTitle>Complete Payment</DialogTitle>
            <DialogDescription>
              Total amount: ${cartTotal.toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Payment Method */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["cash", "card"] as const).map((method) => (
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
                <span className="font-medium">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Tax:</span>
                <span className="font-medium">${cartTax.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>
                    Discount ({discountType === "percent" ? "%" : "$"}):
                  </span>
                  <span className="font-medium">
                    -$
                    {(discountType === "amount"
                      ? discount
                      : cartSubtotal * (discount / 100)
                    ).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold">
                <span>Total:</span>
                <span className="text-blue-600">${cartTotal.toFixed(2)}</span>
              </div>

              {amountPaid >= cartTotal && (
                <div className="flex justify-between text-sm bg-green-50 p-2 rounded border border-green-200">
                  <span className="text-green-700">Change:</span>
                  <span className="font-semibold text-green-700">
                    ${(amountPaid - cartTotal).toFixed(2)}
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
                disabled={amountPaid < cartTotal}
                className="bg-green-600 hover:bg-green-700"
              >
                Complete Sale
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Draft Dialog */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Order Draft</DialogTitle>
            <DialogDescription>
              Give this draft a name to save it for later
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                Draft Name
              </label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g., Table 5, Order #123"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  setShowDraftDialog(false);
                  setDraftName("");
                }}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSaveDraft}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Save Draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </POSLayout>
  );
}
