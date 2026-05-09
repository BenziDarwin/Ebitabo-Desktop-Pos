"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Share2, Copy, Check, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import type { CartItem } from "@/lib/types";

interface ShareOrderProps {
  orderId: string;
  items: CartItem[];
  total: number;
  clientName?: string;
  clientEmail?: string;
}

export function ShareOrder({
  orderId,
  items,
  total,
  clientName,
  clientEmail,
}: ShareOrderProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const orderSummary = `
Order #${orderId.slice(-6)}
Customer: ${clientName || "Guest"}

Items:
${items.map((item) => `- ${item.name} x${item.quantity}: $${item.subtotal.toFixed(2)}`).join("\n")}

Total: $${total.toFixed(2)}

Ordered from Coffee Corner POS System
  `.trim();

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(orderSummary);
    setCopied(true);
    toast.success("Order details copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareViaEmail = () => {
    const subject = `Coffee Corner Order #${orderId.slice(-6)}`;
    const body = encodeURIComponent(orderSummary);
    window.open(
      `mailto:${clientEmail || ""}?subject=${encodeURIComponent(subject)}&body=${body}`,
    );
  };

  const handleShareViaWhatsApp = () => {
    const message = encodeURIComponent(orderSummary);
    window.open(`https://wa.me/?text=${message}`);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Share2 className="w-4 h-4" />
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Order Summary Preview */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {orderSummary}
            </div>

            {/* Share Options */}
            <div className="space-y-2">
              {/* Copy to Clipboard */}
              <Button
                onClick={handleCopyToClipboard}
                variant="outline"
                className="w-full justify-start gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy to Clipboard
                  </>
                )}
              </Button>

              {/* Email */}
              {clientEmail && (
                <Button
                  onClick={handleShareViaEmail}
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Email to {clientEmail.split("@")[0]}
                </Button>
              )}

              {/* WhatsApp */}
              <Button
                onClick={handleShareViaWhatsApp}
                variant="outline"
                className="w-full justify-start gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Share via WhatsApp
              </Button>
            </div>

            <Button
              onClick={() => setOpen(false)}
              variant="outline"
              className="w-full"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
