// send-notifications
//
// Called from the browser the moment a payment completes (M-Pesa STK sent,
// Stripe redirect-back trusted, or PayPal capture confirmed) — see
// components/BookingFlow.tsx `completeBooking`. Implements
// Update_Module.md §4: an automatic email (via Resend) and SMS (via
// Twilio) with the same booking details, sent the instant payment is
// confirmed, so the guest's booking info reaches them without them having
// to do anything or worry about losing it.
//
// This is intentionally called directly from the browser with the anon
// key (same reasoning as create-payment-intent: the site is a static
// export with no server to proxy through) — it only ever reads the
// payload it's given and calls Resend/Twilio with secrets that live in
// this function's environment, never in the bundle.
//
// Required env vars: RESEND_API_KEY, RESEND_FROM_EMAIL (optional),
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

import { sendAllNotifications, type NotifyPayload } from "../_shared/notify.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Partial<NotifyPayload> & { bookingId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { reference, paymentId, provider, guestName, guestEmail } = body;
  if (!reference || !paymentId || !provider || !guestEmail) {
    return json({ error: "reference, paymentId, provider, and guestEmail are required" }, 400);
  }

  const payload: NotifyPayload = {
    reference,
    paymentId,
    provider,
    guestName: guestName ?? "",
    guestEmail,
    smsPhone: body.smsPhone,
    checkIn: body.checkIn ?? "",
    checkOut: body.checkOut ?? "",
    guests: body.guests ?? 1,
    depositKES: body.depositKES ?? 0,
    totalKES: body.totalKES ?? 0,
  };

  const result = await sendAllNotifications(payload);
  return json(result, result.ok ? 200 : 207);
});
