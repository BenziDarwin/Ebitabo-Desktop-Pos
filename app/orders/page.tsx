"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePOS } from "@/provider/pos-provider";
import { useAuth } from "@/provider/auth-provider";
import { POSLayout } from "@/components/pos-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import {
  Trash2,
  Eye,
  Plus,
  FileText,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format-currency";
import { formatQuantity, toPositiveQuantity } from "@/lib/quantity";
import {
  findFirstInsufficientStock,
  formatStockQuantity,
  getLocalProductStockMap,
} from "@/services/cart-stock-service";
import {
  fetchServerOrders,
  resolveNumericUserId,
  sendOrderStatus,
} from "@/services/remote-order-service";
import type { OrderDraft, CartItem } from "@/lib/types";

export default function OrdersPage() {
  const { user, business, currency } = useAuth();
  const router = useRouter();
  const {
    orderDrafts,
    loadOrderDraft,
    markOrderDraftCancelled,
    restoreOrderDraft,
    deleteOrderDraft,
    mergeServerOrders,
    clearCart,
    saveOrderDraft,
  } = usePOS();

  const [currentTab, setCurrentTab] = useState<"active" | "deleted">("active");
  const [selectedDraft, setSelectedDraft] = useState<OrderDraft | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );
  const [showDetails, setShowDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSyncingServer, setIsSyncingServer] = useState(false);
  const orderDraftsRef = useRef(orderDrafts);
  orderDraftsRef.current = orderDrafts;

  const syncOrders = useCallback(
    async (showToast = false) => {
      const userIdNum = resolveNumericUserId(user?.id, business?.userId);
      if (!userIdNum) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (showToast)
          toast.error("You are offline. Cannot sync server orders.");
        return;
      }

      setIsSyncingServer(true);
      try {
        const fetched = await fetchServerOrders(userIdNum);
        const serverRefs = new Set(
          fetched.map((o) => o.reference).filter(Boolean),
        );

        // Push any local active drafts not yet present on the server
        let pushedCount = 0;
        for (const localDraft of orderDraftsRef.current) {
          if (
            localDraft.state === "created" &&
            localDraft.reference &&
            !serverRefs.has(localDraft.reference)
          ) {
            try {
              await sendOrderStatus(localDraft, "created", {
                servedBy:
                  localDraft.servedBy ||
                  user?.name ||
                  user?.username ||
                  "Staff",
                userId: userIdNum,
              });
              pushedCount += 1;
            } catch (pushErr) {
              console.warn(
                `Failed to push local order ${localDraft.reference}:`,
                pushErr,
              );
            }
          }
        }

        if (fetched.length > 0) {
          mergeServerOrders(fetched);
        }

        if (showToast) {
          if (fetched.length > 0 || pushedCount > 0) {
            toast.success(
              `Synced ${fetched.length} server orders${pushedCount > 0 ? ` and pushed ${pushedCount} local orders` : ""}.`,
            );
          } else {
            toast.info("No server orders found for current user.");
          }
        }
      } catch (err) {
        console.warn("Failed to sync server orders:", err);
        if (showToast) {
          toast.error("Failed to sync orders from server.");
        }
      } finally {
        setIsSyncingServer(false);
      }
    },
    [user?.id, user?.name, user?.username, business?.userId, mergeServerOrders],
  );

  useEffect(() => {
    void syncOrders(false);
  }, [syncOrders]);

  const activeDrafts = orderDrafts.filter(
    (draft) => draft.state !== "cancelled" && draft.state !== "completed",
  );
  const deletedDrafts = orderDrafts.filter(
    (draft) => draft.state === "cancelled",
  );
  const displayedDrafts =
    currentTab === "active" ? activeDrafts : deletedDrafts;

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
        quantity: toPositiveQuantity(item.quantity, 1),
      }));
      const stockByProductId = getLocalProductStockMap();
      const stockIssue = findFirstInsufficientStock(
        normalizedItems,
        stockByProductId,
      );
      if (stockIssue) {
        toast.error(
          `${stockIssue.itemName} exceeds stock. Available: ${formatStockQuantity(stockIssue.available)}, requested: ${formatQuantity(stockIssue.requested)}.`,
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

  const handleDeleteDraft = async (draftId: string) => {
    const target = orderDrafts.find((d) => d.id === draftId);
    if (!target) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error(
        "Offline Action Blocked: Deleting an order requires an active internet connection to synchronize the cancellation with the server.",
      );
      return;
    }

    try {
      setIsDeleting(true);
      let serverSynced = true;
      try {
        await sendOrderStatus(target, "cancelled", {
          servedBy: target.servedBy || user?.name || user?.username || "Staff",
          userId: resolveNumericUserId(user?.id, business?.userId) || 1,
        });
      } catch (syncError: unknown) {
        serverSynced = false;
        console.warn("eb_pos.order cancel sync error:", syncError);
      }

      markOrderDraftCancelled(draftId);
      setShowDeleteConfirm(null);
      setShowDetails(false);
      if (serverSynced) {
        toast.success("Order cancelled on server and moved to Deleted tab");
      } else {
        toast.warning(
          "Order moved to Deleted tab locally, but server sync failed.",
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreDraft = async (draft: OrderDraft) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error(
        "Offline Action Blocked: Restoring an order requires an active internet connection to synchronize with the server.",
      );
      return;
    }

    try {
      setIsRestoring(true);
      let serverSynced = true;
      try {
        await sendOrderStatus(draft, "created", {
          servedBy: draft.servedBy || user?.name || user?.username || "Staff",
          userId: resolveNumericUserId(user?.id, business?.userId) || 1,
        });
      } catch (syncError: unknown) {
        serverSynced = false;
        console.warn("eb_pos.order restore sync error:", syncError);
      }

      restoreOrderDraft(draft.id);
      if (serverSynced) {
        toast.success("Order restored back to Saved orders");
      } else {
        toast.warning("Order restored locally, but server sync failed.");
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleNewOrder = () => {
    clearCart();
    router.push("/sell");
  };

  return (
    <POSLayout currentPage="orders">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Orders</h1>
            <p className="text-slate-600 mt-1">
              Manage active and deleted orders with server synchronization
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void syncOrders(true)}
              disabled={isSyncingServer}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isSyncingServer ? "animate-spin" : ""}`}
              />
              {isSyncingServer ? "Syncing..." : "Sync Orders"}
            </Button>
            <Button
              onClick={handleNewOrder}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Order
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-slate-200 mb-6">
          <button
            onClick={() => setCurrentTab("active")}
            className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors ${
              currentTab === "active"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Saved Orders ({activeDrafts.length})
          </button>
          <button
            onClick={() => setCurrentTab("deleted")}
            className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors ${
              currentTab === "deleted"
                ? "border-red-600 text-red-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Deleted Orders ({deletedDrafts.length})
          </button>
          {currentTab === "deleted" && deletedDrafts.length > 0 && (
            <div className="ml-auto pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  for (const d of deletedDrafts) {
                    deleteOrderDraft(d.id, { restoreStock: false });
                  }
                  toast.success("Cleared deleted orders");
                }}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear Deleted
              </Button>
            </div>
          )}
        </div>

        {/* Orders Grid */}
        {displayedDrafts.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {currentTab === "active"
                ? "No saved orders"
                : "No deleted orders"}
            </h3>
            <p className="text-slate-600 mb-6">
              {currentTab === "active"
                ? "Start a new order or save drafts from the sell screen"
                : "Cancelled orders synced with the server will appear here"}
            </p>
            {currentTab === "active" && (
              <Button
                onClick={handleNewOrder}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Create Order
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedDrafts.map((draft) => (
              <div
                key={draft.id}
                className={`bg-white rounded-lg border overflow-hidden hover:shadow-lg transition-shadow ${
                  draft.state === "cancelled"
                    ? "border-red-200 bg-red-50/20"
                    : "border-slate-200"
                }`}
              >
                {/* Draft Header */}
                <div
                  className={`p-4 border-b flex items-start justify-between ${
                    draft.state === "cancelled"
                      ? "bg-red-50 border-red-200"
                      : "bg-gradient-to-r from-blue-50 to-blue-100 border-slate-200"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 truncate">
                        {draft.reference ||
                          draft.notes ||
                          `Order ${draft.id.slice(-8)}`}
                      </h3>
                      {draft.state === "cancelled" && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-700">
                          Deleted
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {new Date(draft.createdAt).toLocaleDateString()} at{" "}
                      {new Date(draft.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
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
                            {item.name} x{formatQuantity(item.quantity)}
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
                      <span
                        className={
                          draft.state === "cancelled"
                            ? "text-red-600"
                            : "text-blue-600"
                        }
                      >
                        {formatCurrency(draft.total, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Client & Served By Info */}
                  {(draft.client || draft.servedBy) && (
                    <div className="mb-4 space-y-1">
                      {draft.client && (
                        <div className="p-2 bg-blue-50 rounded border border-blue-200">
                          <p className="text-xs text-blue-900">
                            <span className="font-semibold">Client:</span>{" "}
                            {draft.client.name}
                          </p>
                        </div>
                      )}
                      {draft.servedBy && (
                        <div className="p-2 bg-slate-50 rounded border border-slate-200">
                          <p className="text-xs text-slate-700">
                            <span className="font-semibold">Served by:</span>{" "}
                            {draft.servedBy}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {draft.state === "cancelled" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleViewDetails(draft)}
                        variant="outline"
                        size="sm"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button
                        onClick={() => handleRestoreDraft(draft)}
                        disabled={isRestoring}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        size="sm"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                    </div>
                  ) : (
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
                  )}
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
        showAddItems={selectedDraft?.state !== "cancelled"}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm !== null}
        onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Order?</DialogTitle>
            <DialogDescription>
              Deleting requires active internet connection. This will cancel the
              order on the server and move it to the Deleted tab.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => setShowDeleteConfirm(null)}
              variant="outline"
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                showDeleteConfirm && handleDeleteDraft(showDeleteConfirm)
              }
              variant="destructive"
              disabled={isDeleting}
            >
              {isDeleting ? "Cancelling..." : "Delete Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </POSLayout>
  );
}
