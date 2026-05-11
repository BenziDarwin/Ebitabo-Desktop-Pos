"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Trash2, Printer } from "lucide-react";
import { useAuth } from "@/provider/auth-provider";
import { formatCurrency } from "@/lib/format-currency";
import { printReceiptWeb } from "@/lib/print-receipt";
import {
  clampCartItemQuantityToStock,
  getLocalProductStockMap,
  resolveMaxAllowedQuantity,
} from "@/services/cart-stock-service";
import type { OrderDraft, CartItem } from "@/lib/types";
import { toast } from "sonner";

interface OrderDetailsDialogProps {
  open: boolean;
  order: OrderDraft | null;
  onClose: () => void;
  onAddItems?: (items: CartItem[]) => void;
  onContinueEditing?: (orderId: string) => void;
  showAddItems?: boolean;
  isCompletedOrder?: boolean;
}

function cloneCartItems(items: CartItem[]): CartItem[] {
  return items.map((item) => ({ ...item }));
}

export function OrderDetailsDialog({
  open,
  order,
  onClose,
  onAddItems,
  onContinueEditing,
  showAddItems = false,
  isCompletedOrder = false,
}: OrderDetailsDialogProps) {
  const { currency, business } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<CartItem[]>([]);
  const stockByProductId = getLocalProductStockMap();

  if (!order) return null;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setEditMode(false);
      setEditedItems([]);
      onClose();
    }
  };

  const handleStartEditMode = () => {
    setEditedItems(cloneCartItems(order.items));
    setEditMode(true);
  };

  const handleSaveEdits = () => {
    if (onAddItems) {
      onAddItems(editedItems);
    }
    setEditMode(false);
    setEditedItems([]);
  };

  const handlePrint = () => {
    const opened = printReceiptWeb({
      items: order.items,
      total: order.total,
      currency: currency?.name ?? "",
      receiptNumber: order.id,
      type: isCompletedOrder ? "Sale" : "Order",
      timestamp: new Date(order.createdAt),
      business,
    });
    if (!opened) {
      window.alert("Please allow pop-ups in your browser to print receipts.");
    }
  };

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setEditedItems(editedItems.filter((entry) => entry.id !== itemId));
      return;
    }

    const targetItem = editedItems.find((entry) => entry.id === itemId);
    if (!targetItem) return;

    const normalizedRequested = Math.max(1, Math.floor(quantity));
    const clampedQuantity = clampCartItemQuantityToStock(
      targetItem,
      normalizedRequested,
      stockByProductId,
    );
    const maxAllowed = resolveMaxAllowedQuantity(targetItem, stockByProductId);

    if (maxAllowed !== null && normalizedRequested > maxAllowed) {
      toast.error(
        `Only ${maxAllowed} unit${maxAllowed === 1 ? "" : "s"} available for ${targetItem.name}.`,
      );
    }

    if (clampedQuantity <= 0) {
      setEditedItems(editedItems.filter((entry) => entry.id !== itemId));
      return;
    }

    setEditedItems(
      editedItems.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              quantity: clampedQuantity,
              subtotal: entry.price * clampedQuantity,
            }
          : entry,
      ),
    );
  };

  const handleUpdatePrice = (itemId: string, price: number) => {
    const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
    setEditedItems(
      editedItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              price: safePrice,
              subtotal: safePrice * item.quantity,
            }
          : item,
      ),
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setEditedItems(editedItems.filter((item) => item.id !== itemId));
  };

  const currentItems = editMode ? editedItems : order.items;
  const currentSubtotal = currentItems.reduce(
    (sum, item) => sum + item.subtotal,
    0,
  );
  const currentTax = currentItems.reduce(
    (sum, item) => sum + item.subtotal * item.tax,
    0,
  );
  const discountAmount =
    order.discountType === "amount"
      ? order.discount
      : currentSubtotal * (order.discount / 100);
  const currentTotal = Math.max(
    0,
    currentSubtotal + currentTax - discountAmount,
  );
  const formatPrice = (value: number) => formatCurrency(value, currency);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1200px] sm:max-w-[1200px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              Order #{order.id.slice(-6)} -{" "}
              {new Date(order.createdAt).toLocaleDateString()}
            </DialogTitle>
            {!editMode && (
              <Button
                onClick={handlePrint}
                variant="outline"
                size="sm"
                className="gap-2 rounded-lg"
              >
                <Printer className="w-4 h-4" />
                Print
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Client Info */}
          {order.client && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-900">
                Customer:{" "}
                <span className="font-semibold">{order.client.name}</span>
              </p>
            </div>
          )}

          {/* Items List */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-900">Items</h3>
              {!editMode && showAddItems && !isCompletedOrder && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleStartEditMode}
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                  >
                    Edit
                  </Button>
                  {onContinueEditing ? (
                    <Button
                      onClick={() => onContinueEditing(order.id)}
                      size="sm"
                      className="rounded-lg bg-blue-600 hover:bg-blue-700"
                    >
                      Add Items
                    </Button>
                  ) : null}
                </div>
              )}
              {editMode && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={handleSaveEdits}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    Save Changes
                  </Button>
                  <Button
                    onClick={() => {
                      setEditMode(false);
                      setEditedItems([]);
                    }}
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {currentItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-white rounded-lg border border-slate-200 hover:shadow-sm transition-shadow"
                >
                  {editMode ? (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {formatPrice(item.price)} each
                          </p>
                        </div>
                        <Button
                          onClick={() => handleRemoveItem(item.id)}
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg h-9 w-9 p-0 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_9rem_1fr] sm:items-end">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Unit Price
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.price}
                            onChange={(e) =>
                              handleUpdatePrice(
                                item.id,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Qty
                          </label>
                          <div className="flex items-center gap-1 bg-slate-50 rounded-lg border border-slate-200 px-1 h-9">
                            <Button
                              onClick={() =>
                                handleUpdateQuantity(
                                  item.id,
                                  Math.max(0, item.quantity - 1),
                                )
                              }
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-slate-200 rounded-md"
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateQuantity(
                                  item.id,
                                  Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0),
                                  ),
                                )
                              }
                              className="w-10 text-center text-sm font-semibold border-0 focus:ring-0 bg-transparent"
                            />
                            <Button
                              onClick={() =>
                                handleUpdateQuantity(item.id, item.quantity + 1)
                              }
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-slate-200 rounded-md"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-[11px] font-medium text-slate-500 mb-1">
                            Line Total
                          </p>
                          <p className="text-sm font-bold text-blue-600">
                            {formatPrice(item.subtotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {formatPrice(item.price)} each
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-slate-900">
                          {item.quantity}x
                        </p>
                        <p className="font-bold text-blue-600">
                          {formatPrice(item.subtotal)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-5 rounded-lg border border-slate-200 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-700">Subtotal</span>
              <span className="font-medium text-slate-900">
                {formatPrice(currentSubtotal)}
              </span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Discount</span>
                <span className="font-medium">
                  -{formatPrice(discountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-700">Tax</span>
              <span className="font-medium text-slate-900">
                {formatPrice(currentTax)}
              </span>
            </div>
            <div className="flex justify-between font-semibold text-lg border-t border-slate-300 pt-3 mt-2">
              <span className="text-slate-900">Total</span>
              <span className="text-blue-600">{formatPrice(currentTotal)}</span>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <p className="text-xs font-semibold text-amber-900 mb-2">Notes</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">
                {order.notes}
              </p>
            </div>
          )}

          {/* Close Button */}
          <Button
            onClick={() => {
              setEditMode(false);
              setEditedItems([]);
              onClose();
            }}
            variant="outline"
            className="w-full rounded-lg h-10 font-medium"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
