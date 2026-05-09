"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Trash2, Printer } from "lucide-react";
import type { OrderDraft, CartItem } from "@/lib/types";

interface OrderDetailsDialogProps {
  open: boolean;
  order: OrderDraft | null;
  onClose: () => void;
  onAddItems?: (items: CartItem[]) => void;
  showAddItems?: boolean;
  isCompletedOrder?: boolean;
}

export function OrderDetailsDialog({
  open,
  order,
  onClose,
  onAddItems,
  showAddItems = false,
  isCompletedOrder = false,
}: OrderDetailsDialogProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<CartItem[]>([]);

  if (!order) return null;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setEditMode(false);
      onClose();
    }
  };

  const handleEditMode = () => {
    if (editMode && onAddItems) {
      onAddItems(editedItems);
    }
    setEditedItems(order.items);
    setEditMode(!editMode);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const discountAmount =
        order.discountType === "amount"
          ? order.discount
          : order.subtotal * (order.discount / 100);

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt - Order #${order.id.slice(-6)}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              width: 80mm;
              margin: 0;
              padding: 20px;
              background: white;
            }
            .receipt {
              text-align: center;
            }
            .header {
              border-bottom: 1px solid #000;
              padding-bottom: 15px;
              margin-bottom: 15px;
            }
            .header h1 {
              margin: 0;
              font-size: 16px;
              font-weight: bold;
            }
            .header p {
              margin: 5px 0 0 0;
              font-size: 12px;
            }
            .order-info {
              text-align: left;
              font-size: 11px;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 1px solid #000;
            }
            .order-info p {
              margin: 3px 0;
            }
            .items {
              text-align: left;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 1px solid #000;
              font-size: 11px;
            }
            .item-header {
              display: grid;
              grid-template-columns: 1fr 2fr 1fr;
              gap: 10px;
              margin-bottom: 8px;
              padding-bottom: 8px;
              border-bottom: 1px solid #ccc;
              font-weight: bold;
            }
            .item {
              display: grid;
              grid-template-columns: 1fr 2fr 1fr;
              gap: 10px;
              margin-bottom: 5px;
            }
            .item-qty {
              text-align: center;
            }
            .item-name {
              text-align: left;
            }
            .item-price {
              text-align: right;
              font-weight: bold;
            }
            .totals {
              font-size: 11px;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 1px solid #000;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
            }
            .total-final {
              display: flex;
              justify-content: space-between;
              margin-top: 5px;
              font-weight: bold;
              font-size: 12px;
            }
            .footer {
              text-align: center;
              font-size: 11px;
              color: #666;
            }
            .footer p {
              margin: 3px 0;
            }
            @media print {
              body { margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              <h1>COFFEE CORNER</h1>
              <p>Point of Sale Receipt</p>
            </div>

            <div class="order-info">
              <p>Order: #${order.id.slice(-6)}</p>
              <p>${new Date(order.createdAt).toLocaleDateString()} ${new Date(order.createdAt).toLocaleTimeString()}</p>
              ${order.client ? `<p>Customer: ${order.client.name}</p>` : ""}
            </div>

            <div class="items">
              <div class="item-header">
                <div>Qty</div>
                <div>Item</div>
                <div>Total</div>
              </div>
              ${order.items
                .map(
                  (item) => `
                <div class="item">
                  <div class="item-qty">${item.quantity}</div>
                  <div class="item-name">
                    ${item.name}<br/>
                    <span style="color: #666;">$${item.price.toFixed(2)} ea</span>
                  </div>
                  <div class="item-price">$${item.subtotal.toFixed(2)}</div>
                </div>
              `,
                )
                .join("")}
            </div>

            <div class="totals">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>$${order.subtotal.toFixed(2)}</span>
              </div>
              ${
                order.discount > 0
                  ? `
                <div class="total-row" style="color: #dc2626;">
                  <span>Discount:</span>
                  <span>-$${discountAmount.toFixed(2)}</span>
                </div>
              `
                  : ""
              }
              <div class="total-row">
                <span>Tax:</span>
                <span>$${order.tax.toFixed(2)}</span>
              </div>
              <div class="total-final">
                <span>Total:</span>
                <span>$${order.total.toFixed(2)}</span>
              </div>
            </div>

            <div class="footer">
              <p>Thank you for your purchase!</p>
              <p>Please come again</p>
            </div>
          </div>
        </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setEditedItems(editedItems.filter((item) => item.id !== itemId));
    } else {
      setEditedItems(
        editedItems.map((item) =>
          item.id === itemId
            ? { ...item, quantity, subtotal: item.price * quantity }
            : item,
        ),
      );
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setEditedItems(editedItems.filter((item) => item.id !== itemId));
  };

  const discountAmount =
    order.discountType === "amount"
      ? order.discount
      : order.subtotal * (order.discount / 100);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              Order #{order.id.slice(-6)} •{" "}
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
              {!editMode && showAddItems && (
                <Button
                  onClick={handleEditMode}
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                >
                  Edit
                </Button>
              )}
              {editMode && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleEditMode}
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
              {(editMode ? editedItems : order.items).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">
                      ${item.price.toFixed(2)} each
                    </p>
                  </div>

                  {editMode ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200">
                        <Button
                          onClick={() =>
                            handleUpdateQuantity(
                              item.id,
                              Math.max(0, item.quantity - 1),
                            )
                          }
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-slate-200 rounded-md"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateQuantity(
                              item.id,
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-12 text-center text-sm font-semibold border-0 focus:ring-0 bg-transparent"
                        />
                        <Button
                          onClick={() =>
                            handleUpdateQuantity(item.id, item.quantity + 1)
                          }
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-slate-200 rounded-md"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <Button
                        onClick={() => handleRemoveItem(item.id)}
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg h-8 w-8 p-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {item.quantity}x
                      </p>
                      <p className="font-bold text-blue-600">
                        ${item.subtotal.toFixed(2)}
                      </p>
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
                ${order.subtotal.toFixed(2)}
              </span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Discount</span>
                <span className="font-medium">
                  -${discountAmount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-700">Tax</span>
              <span className="font-medium text-slate-900">
                ${order.tax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between font-semibold text-lg border-t border-slate-300 pt-3 mt-2">
              <span className="text-slate-900">Total</span>
              <span className="text-blue-600">${order.total.toFixed(2)}</span>
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
            onClick={onClose}
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
