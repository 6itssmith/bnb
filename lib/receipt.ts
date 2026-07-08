import { property } from "@/lib/data";

export type ReceiptData = {
  reference: string;
  paymentId: string;
  provider: "mpesa" | "stripe" | "paypal";
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string; // formatted, e.g. "12 Aug 2026"
  checkOut: string;
  guests: number;
  nights: number;
  subtotalKES: number;
  serviceFeeKES: number;
  totalKES: number;
  depositKES: number;
  paidAt: string; // formatted date/time
};

const providerLabel: Record<ReceiptData["provider"], string> = {
  mpesa: "M-Pesa (sandbox)",
  stripe: "Card via Stripe (test mode)",
  paypal: "PayPal (sandbox)",
};

/**
 * Builds a small, self-contained HTML document for the receipt — this is
 * intentionally NOT the same markup as the page around it, so downloading
 * or printing it never drags in the navbar/footer/booking stepper the way
 * `window.print()` on the whole page used to. Kept dependency-free (no PDF
 * library) so it works the same in every browser without an extra
 * install; opening the downloaded .html file also lets a guest print it
 * to PDF themselves from any device.
 */
export function buildReceiptHtml(data: ReceiptData): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;color:#6b5b4a;">${label}</td>
      <td style="padding:6px 0;text-align:right;font-weight:600;color:#2C2C2C;">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Receipt ${data.reference} — ${property.name}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#F8F1E9; margin:0; padding:32px; color:#2C2C2C; }
  .sheet { max-width:560px; margin:0 auto; background:#ffffff; border-radius:16px; padding:36px; box-shadow:0 4px 20px rgba(139,90,43,0.15); }
  .brand { font-size:24px; font-weight:700; color:#8B5A2B; margin:0 0 4px; }
  .sub { color:#6b5b4a; font-size:13px; margin:0 0 24px; }
  .ref { display:inline-block; background:#4A7043; color:#F8F1E9; font-weight:700; font-size:13px; padding:6px 14px; border-radius:999px; margin-bottom:20px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  hr { border:none; border-top:1px solid #eadfce; margin:16px 0; }
  .total-row td { font-size:16px; font-weight:700; color:#8B5A2B; padding-top:10px; }
  .footer { margin-top:28px; font-size:12px; color:#9a8b78; text-align:center; }
</style>
</head>
<body>
  <div class="sheet">
    <p class="brand">${property.name}</p>
    <p class="sub">${property.location} &middot; Payment receipt</p>
    <span class="ref">${data.paymentId}</span>

    <table>
      ${row("Guest", data.guestName)}
      ${row("Email", data.guestEmail)}
      ${row("Phone", data.guestPhone)}
      ${row("Check-in", data.checkIn)}
      ${row("Check-out", data.checkOut)}
      ${row("Guests", String(data.guests))}
    </table>
    <hr />
    <table>
      ${row(`Nightly rate x ${data.nights} night${data.nights === 1 ? "" : "s"}`, `KES ${data.subtotalKES.toLocaleString()}`)}
      ${row("Service fee", `KES ${data.serviceFeeKES.toLocaleString()}`)}
      ${row("Total booking value", `KES ${data.totalKES.toLocaleString()}`)}
    </table>
    <hr />
    <table>
      <tr class="total-row">
        <td>Amount paid today (deposit)</td>
        <td style="text-align:right;">KES ${data.depositKES.toLocaleString()}</td>
      </tr>
    </table>
    <hr />
    <table>
      ${row("Payment method", providerLabel[data.provider])}
      ${row("Reference", data.reference)}
      ${row("Paid at", data.paidAt)}
    </table>

    <p class="footer">This is a sandbox / test-mode transaction — no real funds were moved.<br/>${property.name} &middot; ${property.location}</p>
  </div>
</body>
</html>`;
}

/** Triggers a browser download of the receipt as a standalone .html file. */
export function downloadReceipt(data: ReceiptData) {
  const html = buildReceiptHtml(data);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.paymentId}-receipt.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
