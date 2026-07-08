// create-payment-intent
//
// Called by the Next.js Route Handler (or any trusted server). Creates a
// booking if one isn't supplied, inserts a payments row, and asks the
// provider for an intent/order.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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

function siteUrl() {
  return (Deno.env.get("SITE_URL") ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function base64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

// ==================== M-PESA HELPERS ====================

// Daraja wants Timestamp as yyyyMMddHHmmss in the shortcode's local time.
// Safaricom's sandbox/production shortcodes are both on Africa/Nairobi
// (UTC+3, no DST), so a fixed +3h offset from UTC is correct here.
function mpesaTimestamp(): string {
  const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
  const d = new Date(Date.now() + NAIROBI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

// Daraja requires MSISDN as 254XXXXXXXXX (no leading +, no leading 0).
// Guests may type 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX, or 7XXXXXXXX —
// normalize all of those to the one format Safaricom accepts.
function normalizeMsisdn(raw: string): string {
  let p = raw.trim().replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = `254${p.slice(1)}`;
  else if (p.startsWith("7") || p.startsWith("1")) p = `254${p}`;
  return p;
}

async function mpesaAccessToken(base: string): Promise<string> {
  const key = Deno.env.get("MPESA_CONSUMER_KEY");
  const secret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!key || !secret) {
    throw new Error(
      "M-Pesa env vars are not fully set (MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET)",
    );
  }

  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${base64(`${key}:${secret}`)}` },
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`M-Pesa OAuth failed: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

// ==================== PROVIDER FUNCTIONS ====================

async function createMpesaIntent(opts: {
  phone: string;
  amount: number;
  bookingId: string;
  paymentId: string;
}): Promise<{ providerRef: string }> {
  const env = Deno.env.get("MPESA_ENV") ?? "sandbox";
  const base =
    env === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  const shortcode = Deno.env.get("MPESA_SHORTCODE");
  const passkey = Deno.env.get("MPESA_PASSKEY");
  const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");
  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error(
      "M-Pesa env vars are not fully set (MPESA_SHORTCODE / MPESA_PASSKEY / MPESA_CALLBACK_URL)",
    );
  }

  const token = await mpesaAccessToken(base);
  const timestamp = mpesaTimestamp();
  const password = base64(`${shortcode}${passkey}${timestamp}`);
  const msisdn = normalizeMsisdn(opts.phone);

  const accountRef = `AURACRIB-${opts.bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  const res = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      // Daraja rejects decimals/zero — round up to the nearest whole shilling.
      Amount: Math.max(1, Math.ceil(opts.amount)),
      PartyA: msisdn,
      PartyB: shortcode,
      PhoneNumber: msisdn,
      CallBackURL: callbackUrl,
      AccountReference: accountRef,
      TransactionDesc: "Aura Crib booking deposit",
    }),
  });

  const data = await res.json();

  // Daraja returns 200 with ResponseCode "0" on a successful STK push
  // request (the push itself may still be rejected later by the guest —
  // that comes back async via mpesa-webhook). Anything else is a hard
  // failure to start the push at all.
  if (!res.ok || data.ResponseCode !== "0" || !data.CheckoutRequestID) {
    throw new Error(`M-Pesa STK push failed: ${JSON.stringify(data)}`);
  }

  // CheckoutRequestID is what Safaricom echoes back on the async callback,
  // so it's stored as provider_ref and used by mpesa-webhook to find this
  // payment row again.
  return { providerRef: data.CheckoutRequestID as string };
}

async function createStripeIntent(opts: {
  amount: number;
  currency: string;
  bookingId: string;
  paymentId: string;
}): Promise<{ providerRef: string; url: string }> {
  if (!Deno.env.get("STRIPE_SECRET_KEY")) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  // Checkout Session (not a raw PaymentIntent) because PaymentOptions.tsx
  // expects a hosted `url` to redirect the guest to — this is a static
  // export with no client-side Stripe.js/Elements flow wired up.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: opts.currency.toLowerCase(),
          product_data: { name: "Aura Crib booking deposit" },
          unit_amount: Math.round(opts.amount * 100),
        },
        quantity: 1,
      },
    ],
    // stripe-webhook looks up the booking/payment by this metadata, read
    // off the PaymentIntent — set it there too, not just on the Session.
    metadata: { payment_id: opts.paymentId, booking_id: opts.bookingId },
    payment_intent_data: {
      metadata: { payment_id: opts.paymentId, booking_id: opts.bookingId },
    },
    success_url: `${siteUrl()}/booking?stripe=success&bookingId=${opts.bookingId}`,
    cancel_url: `${siteUrl()}/booking?stripe=cancel&bookingId=${opts.bookingId}`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  const intentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  return { providerRef: intentId ?? session.id, url: session.url };
}

async function createPaypalIntent(opts: {
  amount: number;
  currency: string;
  bookingId: string;
  paymentId: string;
}) {
  const env = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
  const base =
    env === "production"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const id = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET")!;

  const tokRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tok = await tokRes.json();
  if (!tokRes.ok)
    throw new Error(`PayPal OAuth failed: ${JSON.stringify(tok)}`);

  // FIXED: Use USD for PayPal (KES is not supported)
  const paypalCurrency = "USD";

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.bookingId,
          custom_id: opts.paymentId,
          amount: {
            currency_code: paypalCurrency,
            value: opts.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: `${siteUrl()}/booking?paypal=return&bookingId=${opts.bookingId}`,
        cancel_url: `${siteUrl()}/booking?paypal=cancel&bookingId=${opts.bookingId}`,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error(`PayPal order create failed: ${JSON.stringify(data)}`);

  const approveLink = (data.links ?? []).find(
    (l: { rel: string }) => l.rel === "approve",
  );
  return {
    providerRef: data.id as string,
    approveUrl: approveLink?.href as string,
  };
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
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

  // Use USD for PayPal, original currency for others
  const finalCurrency = provider === "paypal" ? "USD" : currency.toUpperCase();

  // ... (rest of your original logic for creating booking and payment row remains the same)

  let bookingId = body.bookingId;
  if (!bookingId) {
    if (!body.booking)
      return json({ error: "bookingId or booking object required" }, 400);
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        ...body.booking,
        currency: finalCurrency,
        status: "pending_payment",
      })
      .select("id")
      .single();
    if (error)
      return json({ error: `booking insert failed: ${error.message}` }, 500);
    bookingId = data.id;
  }

  if (!bookingId) return json({ error: "internal: booking id missing" }, 500);

  const { data: paymentRow, error: payErr } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      provider,
      amount,
      currency: finalCurrency,
      status: "initiated",
    })
    .select("id")
    .single();

  if (payErr)
    return json({ error: `payments insert failed: ${payErr.message}` }, 500);
  const paymentId = paymentRow.id as string;

  try {
    let result: any = { providerRef: "" };

    if (provider === "mpesa") {
      if (!body.phone) return json({ error: "phone required for M-Pesa" }, 400);
      result = await createMpesaIntent({
        phone: body.phone,
        amount,
        bookingId,
        paymentId,
      });
    } else if (provider === "stripe") {
      result = await createStripeIntent({
        amount,
        currency: finalCurrency,
        bookingId,
        paymentId,
      });
    } else {
      result = await createPaypalIntent({
        amount,
        currency: finalCurrency,
        bookingId,
        paymentId,
      });
    }

    await supabase
      .from("payments")
      .update({ provider_ref: result.providerRef })
      .eq("id", paymentId);

    return json({
      providerRef: result.providerRef,
      url: result.url,
      approveUrl: result.approveUrl,
      paymentId,
      bookingId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("payments")
      .update({ status: "failed", raw_payload: { error: message } })
      .eq("id", paymentId);
    return json({ error: message }, 502);
  }
});
