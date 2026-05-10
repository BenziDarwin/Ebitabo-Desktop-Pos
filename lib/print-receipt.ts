import type { BusinessDetails, CartItem } from "@/core/entities";
import appLogo from "@/assets/images/logo.png";

interface WebReceiptPrintData {
  items: CartItem[];
  total: number;
  currency: string;
  receiptNumber?: string;
  amountPaid?: number;
  balance?: number;
  type: string;
  timestamp?: Date;
  business?: BusinessDetails | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function generateReceiptHtml({
  items,
  total,
  currency,
  receiptNumber,
  amountPaid,
  balance,
  type,
  timestamp,
  business,
}: WebReceiptPrintData): string {
  const receiptNo = receiptNumber || `RCP-${Date.now()}`;
  const currencyText = currency || "";
  const logoSrc = business?.business_logo
    ? `data:image/png;base64,${business.business_logo}`
    : appLogo.src;
  const nowText = (timestamp ?? new Date()).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-weight: 700;
    }

    body {
      font-family: "Courier New", monospace;
      width: 80mm;
      background: #fff;
      font-size: 11px;
      line-height: 1.55;
      padding: 4mm 4mm 12mm 4mm;
      letter-spacing: 0.4px;
    }

    .receipt { width: 100%; }

    .logo {
      width: 36px;
      height: 36px;
      display: block;
      margin: 0 auto 8px;
      object-fit: contain;
    }

    .header {
      text-align: center;
      border-bottom: 3px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .company-name {
      font-size: 15px;
      font-weight: 900;
      margin-bottom: 6px;
      letter-spacing: 0.6px;
    }

    .type {
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 6px;
      letter-spacing: 0.6px;
    }

    .company-details {
      font-size: 11px;
      line-height: 1.7;
      font-weight: 700;
    }

    .receipt-info {
      margin-bottom: 10px;
      font-size: 11px;
      font-weight: 700;
    }

    .receipt-info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 10px;
    }

    .items-table th {
      border-bottom: 3px solid #000;
      padding-bottom: 6px;
      font-weight: 900;
    }

    .items-table td {
      padding: 6px 0;
      font-weight: 700;
    }

    .item-name {
      font-weight: 900;
      max-width: 44mm;
      word-wrap: break-word;
    }

    .totals {
      border-top: 3px solid #000;
      padding-top: 8px;
      margin-top: 8px;
      font-size: 12px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .grand-total {
      border-top: 3px solid #000;
      padding-top: 8px;
      margin-top: 8px;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.7px;
    }

    .payment-section {
      border-top: 3px dashed #000;
      margin-top: 12px;
      padding-top: 10px;
      font-size: 12px;
    }

    .balance-row {
      font-weight: 900;
      font-size: 13px;
    }

    .footer {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 3px dashed #000;
      text-align: center;
      font-size: 11px;
      line-height: 1.7;
      font-weight: 900;
    }

    .footer strong {
      font-weight: 900;
      font-size: 12px;
    }

    @page {
      size: 80mm 210mm;
      margin: 0;
    }

    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <img src="${logoSrc}" class="logo" alt="Business logo" />
      <div class="type">${escapeHtml(type)} Receipt</div>
      <div class="company-name">${escapeHtml(
        business?.name || business?.company_name || "Business Name",
      )}</div>
      <div class="company-details">
        ${
          business?.company_phone
            ? `<div>${escapeHtml(business.company_phone)}</div>`
            : ""
        }
        ${
          business?.company_email
            ? `<div>${escapeHtml(business.company_email)}</div>`
            : ""
        }
        ${
          business?.company_address
            ? `<div>${escapeHtml(business.company_address)}</div>`
            : ""
        }
        <div>${escapeHtml(nowText)}</div>
      </div>
    </div>

    <div class="receipt-info">
      <div class="receipt-info-row">
        <span>Reference</span>
        <strong>${escapeHtml(receiptNo)}</strong>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
            <tr>
              <td class="item-name">${escapeHtml(item.name)}</td>
              <td style="text-align:center;">${item.quantity}</td>
              <td style="text-align:right;">${currencyText}${(item.price * item.quantity).toLocaleString()}</td>
            </tr>
          `,
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row grand-total">
        <span>Total Amount</span>
        <span>${currencyText} ${total.toLocaleString()}</span>
      </div>
    </div>

    ${
      amountPaid !== undefined
        ? `
          <div class="payment-section">
            <div class="total-row">
              <span>Paid</span>
              <strong>${currencyText} ${amountPaid.toLocaleString()}</strong>
            </div>
            ${
              balance !== undefined
                ? `
                <div class="total-row balance-row">
                  <span>Balance</span>
                  <strong>${currencyText} ${Math.abs(balance).toLocaleString()}</strong>
                </div>
              `
                : ""
            }
          </div>
        `
        : ""
    }

    <div class="footer">
      <div><strong>Thank you and come again!</strong></div>
      <div style="margin-top:6px;">
        Powered by <strong>Ebtabo</strong> - ebtabo.com
      </div>
      <div>+256 709 573602</div>
    </div>
  </div>
</body>
</html>
`;
}

export function printReceiptWeb(data: WebReceiptPrintData): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return false;
  }

  const html = generateReceiptHtml(data);
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
  return true;
}
