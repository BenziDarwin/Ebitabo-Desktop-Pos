"use client";

import { useState } from "react";
import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { POSLayout } from "@/components/pos-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import { Trash2, Eye, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format-currency";
import {
  findFirstInsufficientStock,
  getLocalProductStockMap,
} from "@/services/cart-stock-service";
import type { OrderDraft, CartItem } from "@/lib/types";

export default function OrdersPage() {
  const { currency } = useAuth();
  const router = useRouter();
  const {
    orderDrafts,
    loadOrderDraft,
    deleteOrderDraft,
    clearCart,
    saveOrderDraft,
  } = usePOS();

  const [selectedDraft, setSelectedDraft] = useState<OrderDraft | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );
  const [showDetails, setShowDetails] = useState(false);

  const handleViewDetails = (draft: OrderDraft) => {
    setSelectedDraft(draft);
    setShowDetails(true);
  };

  const handleLoadDraft = (draftId: string) => {
    loadOrderDraft(draftId);
    toast.success("Draft loaded");
    setShowDetails(false);
    router.push("/sell");
  };

  const handleAddItemsToDraft = (items: CartItem[]) => {
    if (selectedDraft) {
      const normalizedItems = items.map((item) => ({
        ...item,
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      }));
      const stockByProductId = getLocalProductStockMap();
      const stockIssue = findFirstInsufficientStock(
        normalizedItems,
        stockByProductId,
      );
      if (stockIssue) {
        toast.error(
          `${stockIssue.itemName} exceeds stock. Available: ${stockIssue.available}, requested: ${stockIssue.requested}.`,
        );
        return;
      }

      const recalculatedItems = normalizedItems.map((item) => ({
        ...item,
        subtotal: item.price * item.quantity,
      }));
      const subtotal = recalculatedItems.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );
      const tax = recalculatedItems.reduce(
        (sum, item) => sum + item.subtotal * item.tax,
        0,
      );
      const discountAmount =
        selectedDraft.discountType === "amount"
          ? selectedDraft.discount
          : subtotal * (selectedDraft.discount / 100);
      const updated: OrderDraft = {
        ...selectedDraft,
        items: recalculatedItems,
        subtotal,
        tax,
        total: subtotal + tax - discountAmount,
        updatedAt: new Date(),
      };
      saveOrderDraft(updated);
      setSelectedDraft(updated);
      toast.success("Order updated");
    }
  };

  const handleContinueEditingDraft = (draftId: string) => {
    loadOrderDraft(draftId);
    setShowDetails(false);
    setSelectedDraft(null);
    toast.success("Order loaded. Add more items from Sell.");
    router.push("/sell");
  };

  const handleDeleteDraft = (draftId: string) => {
    deleteOrderDraft(draftId);
    setShowDeleteConfirm(null);
    setShowDetails(false);
    toast.success("Draft deleted");
  };

  const handleNewOrder = () => {
    clearCart();
    router.push("/sell");
  };

  return (
    <POSLayout currentPage="orders">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Saved Orders</h1>
            <p className="text-slate-600 mt-1">Manage your draft orders</p>
          </div>
          <Button
            onClick={handleNewOrder}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        </div>

        {/* Orders Grid */}
        {orderDrafts.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No saved orders
            </h3>
            <p className="text-slate-600 mb-6">
              Start a new order or save drafts from the sell screen
            </p>
            <Button
              onClick={handleNewOrder}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Order
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderDrafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Draft Header */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 border-b border-slate-200">
                  <h3 className="font-bold text-slate-900 truncate">
                    {draft.notes || `Order ${draft.id.slice(-8)}`}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    {new Date(draft.createdAt).toLocaleDateString()} at{" "}
                    {new Date(draft.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                {/* Draft Content */}
                <div className="p-4">
                  {/* Items */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">
                      Items ({draft.items.length})
                    </h4>
                    <div className="space-y-1">
                      {draft.items.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between text-sm text-slate-600"
                        >
                          <span>
                            {item.name} x{item.quantity}
                          </span>
                          <span className="font-medium">
                            {formatCurrency(item.subtotal, currency)}
                          </span>
                        </div>
                      ))}
                      {draft.items.length > 3 && (
                        <p className="text-xs text-slate-500 italic pt-1">
                          +{draft.items.length - 3} more items
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-slate-50 rounded p-3 mb-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Subtotal:</span>
                      <span className="font-medium">
                        {formatCurrency(draft.subtotal, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Tax:</span>
                      <span className="font-medium">
                        {formatCurrency(draft.tax, currency)}
                      </span>
                    </div>
                    {draft.discount > 0 && (
                      <div className="flex justify-between text-sm text-red-600">
                        <span>Discount:</span>
                        <span className="font-medium">
                          -
                          {formatCurrency(
                            draft.discountType === "amount"
                              ? draft.discount
                              : draft.subtotal * (draft.discount / 100),
                            currency,
                          )}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-1 flex justify-between font-bold">
                      <span>Total:</span>
                      <span className="text-blue-600">
                        {formatCurrency(draft.total, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Client Info */}
                  {draft.client && (
                    <div className="mb-4 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs text-blue-900">
                        <span className="font-semibold">Client:</span>{" "}
                        {draft.client.name}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => handleViewDetails(draft)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button
                      onClick={() => handleLoadDraft(draft.id)}
                      className="bg-blue-600 hover:bg-blue-700"
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Resume
                    </Button>
                    <Button
                      onClick={() => setShowDeleteConfirm(draft.id)}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Details Dialog */}
      <OrderDetailsDialog
        open={showDetails}
        order={selectedDraft}
        onClose={() => {
          setShowDetails(false);
          setSelectedDraft(null);
        }}
        onAddItems={handleAddItemsToDraft}
        onContinueEditing={handleContinueEditingDraft}
        showAddItems={true}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm !== null}
        onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Draft?</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 mb-6">
            This action cannot be undone. The draft will be permanently deleted.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => setShowDeleteConfirm(null)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                showDeleteConfirm && handleDeleteDraft(showDeleteConfirm)
              }
              variant="destructive"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </POSLayout>
  );
}
