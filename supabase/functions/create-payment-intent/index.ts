// create-payment-intent
//
// Called by the Next.js Route Handler (or any trusted server). Creates a
// booking if one isn't supplied, inserts a payments row, and asks the
// provider for an intent/order. Returns enough information for the browser
// to complete the flow:
//
//   M-Pesa : { providerRef, paymentId, bookingId }   (STK push fires on the
//                                                     guest's phone)
//   Stripe : { providerRef, url, paymentId, bookingId }
//            (browser redirects to Stripe's hosted Checkout at `url`)
//   PayPal : { providerRef, approveUrl, paymentId, bookingId }
//
// Required env vars (set with `supabase secrets set ...`):
//   SUPABASE_URL                       (auto-injected on Supabase)
//   SUPABASE_SERVICE_ROLE_KEY          (auto-injected on Supabase)
//   MPESA_ENV, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
//   MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL
//   STRIPE_SECRET_KEY
//   PAYPAL_ENV, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
//   SITE_URL                            (used for PayPal return/cancel URLs)

import { createClient } from "@supabase/supabase-js";

// --- Supabase admin client (service role) ------------------------------------

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// --- Helpers -----------------------------------------------------------------

// This function is invoked directly from the browser (see
// lib/supabase/functions.ts) rather than through a server-side proxy,
// because the frontend is a static export with no Next.js server to host
// one. That means the browser sends a real cross-origin request — for a
// POST with a JSON body and an Authorization header, that means a CORS
// preflight (OPTIONS) first. Without these headers the preflight 404s (no
// route matches OPTIONS) and the browser blocks the actual POST with a
// CORS error before it ever reaches this code.
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

// PayPal needs a real URL to send the guest back to after they approve
// (or cancel) the order in the PayPal-hosted checkout page.
function siteUrl() {
  return (Deno.env.get("SITE_URL") ?? "http://localhost:3000").replace(/\/$/, "");
}

function paymentTransactionId(provider: string, providerRef: string) {
  return `${provider.toUpperCase()}-${providerRef}`;
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

// M-Pesa STK push requires an OAuth access token. Tokens are valid for
// ~1 hour, so we fetch a fresh one per call (functions are short-lived).
async function mpesaAccessToken(): Promise<string> {
  const env = Deno.env.get("MPESA_ENV") ?? "sandbox";
  const base = env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
  const key = Deno.env.get("MPESA_CONSUMER_KEY")!;
  const secret = Deno.env.get("MPESA_CONSUMER_SECRET")!;
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${base64(`${key}:${secret}`)}` },
  });
  if (!res.ok) throw new Error(`M-Pesa OAuth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

// --- Provider calls ----------------------------------------------------------

async function createMpesaIntent(opts: {
  phone: string;
  amount: number;
  bookingId: string;
  paymentId: string;
}) {
  const env = Deno.env.get("MPESA_ENV") ?? "sandbox";
  const base = env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
  const token = await mpesaAccessToken();

  const shortcode = Deno.env.get("MPESA_SHORTCODE")!;
  const passkey = Deno.env.get("MPESA_PASSKEY")!;
  const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL")!;

  // Daraja validates this timestamp against its own clock, which runs in
  // Africa/Nairobi (EAT, UTC+3, no DST). Deno's Date/toISOString is UTC,
  // so the naive version of this was ~3 hours off and Safaricom's sandbox
  // rejects timestamps outside its accepted window ("Bad Request" /
  // invalid Timestamp). Shift by +3h before formatting.
  const timestamp = new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14); // YYYYMMDDHHmmss
  const password = base64(`${shortcode}${passkey}${timestamp}`);

  // Daraja expects MSISDN as 2547XXXXXXXX, no '+'.
  const phone = opts.phone.replace(/^\+/, "").replace(/^0/, "254");

  const res = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(opts.amount),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: opts.bookingId,
      TransactionDesc: `Booking ${opts.bookingId}`,
    }),
  });

  const data = await res.json();
  if (data.ResponseCode !== "0") {
    throw new Error(`M-Pesa STK push rejected: ${data.ResponseDescription ?? JSON.stringify(data)}`);
  }
  return { providerRef: data.CheckoutRequestID as string };
}

async function createStripeIntent(opts: {
  amount: number;
  currency: string;
  bookingId: string;
  paymentId: string;
}) {
  // A hosted Checkout Session (not a raw PaymentIntent) so the browser can
  // just redirect, the same pattern used for PayPal below. This site is a
  // static export (see next.config.js `output: "export"`) with no server
  // to host Stripe Elements/confirmPayment, so a hosted redirect is the
  // simplest correct integration. Checkout in `payment` mode still creates
  // a PaymentIntent under the hood immediately, and `payment_intent_data`
  // lets us attach the same metadata the stripe-webhook function reads.
  const key = Deno.env.get("STRIPE_SECRET_KEY")!;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  // Include the Checkout Session ID so the return page can verify its state
  // server-side if a Stripe webhook is delayed or misconfigured.
  params.set("success_url", `${siteUrl()}/booking?stripe=success&bookingId=${opts.bookingId}&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${siteUrl()}/booking?stripe=cancel&bookingId=${opts.bookingId}`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", opts.currency.toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(opts.amount * 100)));
  params.set("line_items[0][price_data][product_data][name]", `Booking deposit ${opts.bookingId}`);
  params.set("payment_intent_data[metadata][booking_id]", opts.bookingId);
  params.set("payment_intent_data[metadata][payment_id]", opts.paymentId);
  params.set("metadata[booking_id]", opts.bookingId);
  params.set("metadata[payment_id]", opts.paymentId);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe Checkout Session failed: ${data.error?.message ?? res.status}`);
  }
  // `payment_intent` is populated synchronously for `mode: "payment"` sessions.
  return { providerRef: data.payment_intent as string, url: data.url as string };
}

async function createPaypalIntent(opts: {
  amount: number;
  currency: string;
  bookingId: string;
  paymentId: string;
}) {
  const env = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
  const base = env === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const id = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;

  // OAuth client-credentials token.
  const tokRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tok = await tokRes.json();
  if (!tokRes.ok) throw new Error(`PayPal OAuth failed: ${JSON.stringify(tok)}`);

  // PayPal does not support KES as an Orders API settlement currency. Keep
  // the booking's price in KES, but settle the sandbox order in a supported
  // currency. Configure the conversion explicitly rather than passing KES
  // through and receiving an opaque CURRENCY_NOT_SUPPORTED response.
  const settlementCurrency = (Deno.env.get("PAYPAL_CURRENCY") ?? "USD").toUpperCase();
  if (!['USD', 'EUR'].includes(settlementCurrency)) {
    throw new Error("PAYPAL_CURRENCY must be a PayPal-supported currency such as USD or EUR");
  }
  const kesPerSettlementUnit = Number(Deno.env.get("PAYPAL_KES_PER_UNIT") ?? "130");
  if (!Number.isFinite(kesPerSettlementUnit) || kesPerSettlementUnit <= 0) {
    throw new Error("PAYPAL_KES_PER_UNIT must be a positive number");
  }
  const settlementAmount = opts.currency.toUpperCase() === settlementCurrency
    ? opts.amount
    : opts.amount / kesPerSettlementUnit;

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: opts.bookingId,
        custom_id: opts.paymentId,
        amount: { currency_code: settlementCurrency, value: settlementAmount.toFixed(2) },
      }],
      application_context: {
        return_url: `${siteUrl()}/booking?paypal=return&bookingId=${opts.bookingId}`,
        cancel_url: `${siteUrl()}/booking?paypal=cancel&bookingId=${opts.bookingId}`,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal order create failed: ${JSON.stringify(data)}`);
  const approveLink = (data.links ?? []).find((l: { rel: string }) => l.rel === "approve");
  return { providerRef: data.id as string, approveUrl: approveLink?.href as string };
}

// --- Handler -----------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: {
    provider?: "mpesa" | "stripe" | "paypal";
    amount?: number;
    currency?: string;
    phone?: string;
    bookingId?: string;
    // Used when the caller hasn't inserted a booking yet. Optional.
    booking?: {
      check_in: string;
      check_out: string;
      guests: number;
      guest_name: string;
      guest_email: string;
      guest_phone?: string;
      nightly_rate: number;
      total_amount: number;
      deposit_amount: number;
      currency?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { provider, amount, currency = "KES" } = body;
  if (!provider || !["mpesa", "stripe", "paypal"].includes(provider)) {
    return json({ error: "provider must be mpesa, stripe, or paypal" }, 400);
  }
  if (typeof amount !== "number" || amount <= 0) {
    return json({ error: "amount must be a positive number" }, 400);
  }

  // 1) Resolve / create the booking.
  let bookingId = body.bookingId;
  if (!bookingId) {
    if (!body.booking) return json({ error: "bookingId or booking object required" }, 400);
    const { data, error } = await supabase
      .from("bookings")
      .insert({ ...body.booking, currency: body.booking.currency ?? currency, status: "pending_payment" })
      .select("id")
      .single();
    if (error) return json({ error: `booking insert failed: ${error.message}` }, 500);
    bookingId = data.id;
  }
  // Supabase's untyped client returns `id` as `any`, so the assignment
  // above doesn't narrow `bookingId` back to `string` for the type
  // checker — and it's a real (if unlikely) runtime possibility if the
  // insert above ever returns a falsy id. Guard explicitly.
  if (!bookingId) return json({ error: "internal: booking id missing" }, 500);

  // 2) Insert a payments row up front (status=initiated). The webhook flips it.
  const { data: paymentRow, error: payErr } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      provider,
      amount,
      currency: currency.toUpperCase(),
      status: "initiated",
    })
    .select("id")
    .single();
  if (payErr) return json({ error: `payments insert failed: ${payErr.message}` }, 500);
  const paymentId = paymentRow.id as string;

  // 3) Talk to the provider.
  try {
    let result: { providerRef: string; url?: string; approveUrl?: string } = {
      providerRef: "",
    };
    if (provider === "mpesa") {
      if (!body.phone) return json({ error: "phone required for M-Pesa" }, 400);
      result = await createMpesaIntent({ phone: body.phone, amount, bookingId, paymentId });
    } else if (provider === "stripe") {
      result = await createStripeIntent({ amount, currency, bookingId, paymentId });
    } else {
      result = await createPaypalIntent({ amount, currency, bookingId, paymentId });
    }

    // 4) Stash the provider reference on the payments row.
    const transactionId = paymentTransactionId(provider, result.providerRef);
    const { error: updErr } = await supabase
      .from("payments")
      .update({ provider_ref: result.providerRef, transaction_id: transactionId })
      .eq("id", paymentId);
    if (updErr) console.error("payments update failed", updErr);

    // The Daraja sandbox does not consistently send a terminal callback for
    // cancelled/timed-out prompts. Treat its initial accepted STK response as
    // a test success and persist it immediately so the frontend never polls
    // forever. Production still relies on the signed/provider callback path.
    const mpesaSandbox = provider === "mpesa" && (Deno.env.get("MPESA_ENV") ?? "sandbox") === "sandbox";
    if (mpesaSandbox) {
      const [{ error: paymentUpdateError }, { error: bookingUpdateError }] = await Promise.all([
        supabase
          .from("payments")
          .update({ status: "succeeded", transaction_id: transactionId })
          .eq("id", paymentId),
        supabase
          .from("bookings")
          .update({
            status: "confirmed",
            payment_status: "Success",
            payment_method: "M-Pesa",
            transaction_id: transactionId,
          })
          .eq("id", bookingId),
      ]);
      if (paymentUpdateError || bookingUpdateError) {
        throw new Error(paymentUpdateError?.message ?? bookingUpdateError?.message);
      }
    }

    return json({
      providerRef: result.providerRef,
      url: result.url,
      approveUrl: result.approveUrl,
      paymentId,
      bookingId,
      status: mpesaSandbox ? "succeeded" : undefined,
      transactionId: mpesaSandbox ? transactionId : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Mark the payment failed so we don't leave orphan initiated rows.
    await supabase
      .from("payments")
      .update({ status: "failed", raw_payload: { error: message } })
      .eq("id", paymentId);
    return json({ error: message }, 502);
  }
});
