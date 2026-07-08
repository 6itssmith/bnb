// create-payment-intent
//
// Called by the Next.js Route Handler (or any trusted server). Creates a
// booking if one isn't supplied, inserts a payments row, and asks the
// provider for an intent/order.

import { createClient } from "@supabase/supabase-js";

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

// ==================== PROVIDER FUNCTIONS ====================

async function createMpesaIntent(opts: {
  phone: string;
  amount: number;
  bookingId: string;
  paymentId: string;
}) {
  // ... (your original M-Pesa code remains unchanged)
  const env = Deno.env.get("MPESA_ENV") ?? "sandbox";
  const base =
    env === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  const token = await mpesaAccessToken();
  // ... rest of your M-Pesa implementation
}

async function createStripeIntent(opts: {
  amount: number;
  currency: string;
  bookingId: string;
  paymentId: string;
}) {
  // ... (your original Stripe code remains unchanged)
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
