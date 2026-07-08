// Shared by the send-notifications function (and available to the webhook
// handlers if they're later updated to notify directly on confirmation).
// Both providers are called with plain `fetch` against their REST APIs —
// no SDK needed inside Deno edge functions.

const COMPANY_NAME = "Aura Crib";

export type NotifyPayload = {
  reference: string; // e.g. "AURACRIB-4F9A2C"
  paymentId: string; // e.g. "AURACRIB-MPESA-4F9A2C"
  provider: "mpesa" | "stripe" | "paypal";
  guestName: string;
  guestEmail: string;
  smsPhone?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  depositKES: number;
  totalKES: number;
};

function summaryText(p: NotifyPayload): string {
  return [
    `${COMPANY_NAME} booking confirmed.`,
    `Ref: ${p.reference}`,
    `Payment ID: ${p.paymentId}`,
    `Check-in: ${p.checkIn}`,
    `Check-out: ${p.checkOut}`,
    `Guests: ${p.guests}`,
    `Paid now: KES ${p.depositKES.toLocaleString()} (of KES ${p.totalKES.toLocaleString()} total)`,
  ].join("\n");
}

/** Sends the booking confirmation email via the Resend API. */
export async function sendConfirmationEmail(p: NotifyPayload) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!p.guestEmail) throw new Error("No guest email supplied");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") ?? "bookings@auracrib.co.ke",
      to: p.guestEmail,
      subject: `${COMPANY_NAME} — booking confirmed (${p.reference})`,
      text: summaryText(p),
      html: `
        <div style="font-family:Arial,sans-serif;color:#2C2C2C;">
          <h2 style="color:#8B5A2B;">${COMPANY_NAME}</h2>
          <p>Hi ${p.guestName || "there"}, your booking is confirmed.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#6b5b4a;">Reference</td><td style="text-align:right;font-weight:600;">${p.reference}</td></tr>
            <tr><td style="padding:4px 0;color:#6b5b4a;">Payment ID</td><td style="text-align:right;font-weight:600;">${p.paymentId}</td></tr>
            <tr><td style="padding:4px 0;color:#6b5b4a;">Check-in</td><td style="text-align:right;font-weight:600;">${p.checkIn}</td></tr>
            <tr><td style="padding:4px 0;color:#6b5b4a;">Check-out</td><td style="text-align:right;font-weight:600;">${p.checkOut}</td></tr>
            <tr><td style="padding:4px 0;color:#6b5b4a;">Guests</td><td style="text-align:right;font-weight:600;">${p.guests}</td></tr>
            <tr><td style="padding:4px 0;color:#6b5b4a;">Amount paid</td><td style="text-align:right;font-weight:600;">KES ${p.depositKES.toLocaleString()}</td></tr>
          </table>
          <p style="font-size:12px;color:#9a8b78;margin-top:16px;">Sandbox / test-mode transaction — no real funds were moved.</p>
        </div>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

// Twilio requires E.164 (+2547XXXXXXXX). Guests commonly type 07XXXXXXXX
// or 2547XXXXXXXX without the "+" — normalize before it reaches Twilio's
// API instead of letting it fail silently as "unverified"/invalid number.
// See MD/EMAIL_SMS_SETUP.md §3 step 5.
function normalizeToE164(raw: string): string {
  let p = raw.trim().replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+254${p.slice(1)}`;
  if (p.startsWith("254")) return `+${p}`;
  if (p.startsWith("7") || p.startsWith("1")) return `+254${p}`;
  return `+${p}`;
}

/** Sends the booking confirmation SMS via the Twilio API (sandbox/trial account). */
export async function sendConfirmationSms(p: NotifyPayload) {
  if (!p.smsPhone) throw new Error("No phone number supplied for SMS");

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio env vars are not fully set");
  }

  const body = new URLSearchParams({
    To: normalizeToE164(p.smsPhone),
    From: fromNumber,
    Body: summaryText(p),
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Twilio API error (${res.status}): ${responseBody}`);
  }
}

/** Sends both, tolerating either one failing independently. */
export async function sendAllNotifications(p: NotifyPayload) {
  const results = await Promise.allSettled([
    sendConfirmationEmail(p),
    p.smsPhone ? sendConfirmationSms(p) : Promise.resolve(),
  ]);
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  return { ok: errors.length === 0, errors: errors.map((e) => String(e.reason)) };
}
