// paypal-webhook
//
// PayPal verifies webhook authenticity by calling its own verify endpoint
// (NOT by a shared HMAC like Stripe). We forward the cert URL and the
// signature headers, and PayPal returns SUCCESS / FAILURE.
//
// Events handled:
//   - PAYMENT.CAPTURE.COMPLETED   → payments.status='succeeded',
//                                    bookings.status='confirmed'
//   - PAYMENT.CAPTURE.DENIED      → payments.status='failed'
//
// Required env vars:
//   PAYPAL_ENV                  "sandbox" | "production"
//   PAYPAL_CLIENT_ID
//   PAYPAL_CLIENT_SECRET
//   PAYPAL_WEBHOOK_ID           (the webhook's id, from the PayPal dashboard)

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// btoa() only accepts Latin1 bytes; encoding through TextEncoder first
// keeps this correct for any UTF-8 input without relying on the legacy
// (and non-portable) escape()/unescape() pair.
function base64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function paypalAccessToken(): Promise<string> {
  const env = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
  const base = env === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const id = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function verifyPaypalSignature(req: Request, body: string): Promise<boolean> {
  const env = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
  const base = env === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const token = await paypalAccessToken();

  // PayPal's verify endpoint expects the exact headers from the inbound
  // request. We forward them straight through.
  const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: req.headers.get("paypal-auth-algo"),
      cert_url: req.headers.get("paypal-cert-url"),
      transmission_id: req.headers.get("paypal-transmission-id"),
      transmission_sig: req.headers.get("paypal-transmission-sig"),
      transmission_time: req.headers.get("paypal-transmission-time"),
      webhook_id: Deno.env.get("PAYPAL_WEBHOOK_ID"),
      webhook_event: JSON.parse(body), // PayPal re-serializes it; close enough
    }),
  });
  const out = await verifyRes.json();
  return out.verification_status === "SUCCESS";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await req.text();
  let event: {
    event_type?: string;
    resource?: {
      id?: string;
      custom_id?: string;          // our paymentId (set in create-payment-intent)
      supplementary_data?: { related_ids?: { order_id?: string } };
      status?: string;
    };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  // Verify the request really came from PayPal. If we can't (missing env,
  // network blip), fail closed — we can always re-deliver via the dashboard.
  let verified = false;
  try {
    verified = await verifyPaypalSignature(req, body);
  } catch (err) {
    console.error("paypal verify error", err);
    return json({ error: "verification failed" }, 400);
  }
  if (!verified) return json({ error: "signature invalid" }, 400);

  const type = event.event_type;
  if (type !== "PAYMENT.CAPTURE.COMPLETED" && type !== "PAYMENT.CAPTURE.DENIED") {
    return json({ ok: true, ignored: type });
  }

  const succeeded = type === "PAYMENT.CAPTURE.COMPLETED";
  const paymentId = event.resource?.custom_id;
  if (!paymentId) {
    console.error("paypal-webhook: missing custom_id on resource", event.resource?.id);
    return json({ error: "missing payment id" }, 400);
  }

  // 1) Find + update the payments row.
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, booking_id")
    .eq("id", paymentId)
    .single();
  if (payErr || !payment) {
    console.error("paypal-webhook: no payment for", paymentId, payErr);
    return json({ ok: true, note: "no matching payment" });
  }

  await supabase
    .from("payments")
    .update({
      status: succeeded ? "succeeded" : "failed",
      transaction_id: event.resource?.id ?? null,
      raw_payload: { type, id: event.resource?.id, status: event.resource?.status },
    })
    .eq("id", payment.id);

  // 2) Flip booking on success.
  if (succeeded) {
    await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        payment_status: "Success",
        payment_method: "PayPal",
        transaction_id: event.resource?.id ?? null,
      })
      .eq("id", payment.booking_id);
  } else {
    await supabase
      .from("bookings")
      .update({ payment_status: "Failed", payment_method: "PayPal" })
      .eq("id", payment.booking_id);
  }

  return json({ ok: true });
});
