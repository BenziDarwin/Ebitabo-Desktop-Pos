"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { useReactToPrint } from "react-to-print";

interface ReceiptProps {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  discountType: "amount" | "percent";
  orderId?: string;
  clientName?: string;
  notes?: string;
  cashierName?: string;
  paymentMethod?: string;
  timestamp?: Date;
}

export function Receipt({
  items,
  subtotal,
  tax,
  total,
  discount,
  discountType,
  orderId,
  clientName,
  notes,
  cashierName,
  paymentMethod,
  timestamp,
}: ReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const discountAmount =
    discountType === "amount" ? discount : subtotal * (discount / 100);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  return (
    <div>
      <div
        ref={printRef}
        className="bg-white p-6 text-sm font-mono"
        style={{ width: "80mm" }}
      >
        {/* Header */}
        <div className="text-center border-b border-slate-300 pb-4 mb-4">
          <h1 className="text-lg font-bold">COFFEE CORNER</h1>
          <p className="text-xs text-slate-600">Point of Sale Receipt</p>
        </div>

        {/* Order Info */}
        <div className="text-xs mb-4 pb-4 border-b border-slate-300">
          {orderId && <p>Order ID: {orderId}</p>}
          {timestamp && (
            <p>
              {new Date(timestamp).toLocaleDateString()}{" "}
              {new Date(timestamp).toLocaleTimeString()}
            </p>
          )}
          {cashierName && <p>Cashier: {cashierName}</p>}
          {clientName && <p>Customer: {clientName}</p>}
        </div>

        {/* Items */}
        <div className="mb-4 pb-4 border-b border-slate-300">
          <div className="grid grid-cols-3 gap-2 mb-2 pb-2 border-b border-slate-200">
            <div className="col-span-1 text-xs font-bold">Qty</div>
            <div className="col-span-1 text-xs font-bold text-center">Item</div>
            <div className="col-span-1 text-xs font-bold text-right">Total</div>
          </div>
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-3 gap-2 text-xs mb-1">
              <div className="col-span-1">{item.quantity}</div>
              <div className="col-span-1">
                <div>{item.name}</div>
                <div className="text-slate-600">
                  ${item.price.toFixed(2)} ea
                </div>
              </div>
              <div className="col-span-1 text-right font-bold">
                ${item.subtotal.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="space-y-1 mb-4 pb-4 border-b border-slate-300 text-xs">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount:</span>
              <span>-${discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax:</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Method */}
        {paymentMethod && (
          <div className="text-xs mb-4 pb-4 border-b border-slate-300">
            <p>Payment: {paymentMethod}</p>
          </div>
        )}

        {/* Notes */}
        {notes && (
          <div className="text-xs mb-4 pb-4 border-b border-slate-300">
            <p className="font-bold mb-1">Notes:</p>
            <p className="whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          <p>Thank you for your purchase!</p>
          <p>Please come again</p>
        </div>
      </div>

      {/* Print Button - Only visible outside print */}
      <div className="mt-4 no-print">
        <Button
          onClick={() => handlePrint()}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print Receipt
        </Button>
      </div>
    </div>
  );
}
