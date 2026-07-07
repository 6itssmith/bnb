// stripe-webhook
//
// Stripe sends signed events to this URL. We MUST verify the signature
// using STRIPE_WEBHOOK_SECRET — without that, anyone can POST a fake
// "payment_intent.succeeded" and flip bookings to confirmed.
//
// Events handled:
//   - payment_intent.succeeded            → payments.status='succeeded',
//                                           bookings.status='confirmed'
//   - payment_intent.payment_failed       → payments.status='failed'
//                                           (booking stays pending_payment;
//                                            guest can retry on a new attempt)
//
// Required env vars:
//   STRIPE_SECRET_KEY       (used to construct the Stripe client)
//   STRIPE_WEBHOOK_SECRET   (whsec_… from the dashboard or `stripe listen`)
//
// The signature header is `Stripe-Signature: t=…,v1=…`; Stripe's SDK
// constructEvent handles parsing and verification in one call.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  // The pinned API version in the metadata. The latest is fine; the SDK
  // pins the types it uses against this string.
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const sig = req.headers.get("stripe-signature");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !whSecret) return json({ error: "missing signature or webhook secret" }, 400);

  // The SDK needs the raw body to verify the signature. We must not parse
  // it as JSON first or the hash check will fail.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, whSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `signature verification failed: ${message}` }, 400);
  }

  // We only care about PaymentIntent lifecycle events.
  if (
    event.type !== "payment_intent.succeeded" &&
    event.type !== "payment_intent.payment_failed"
  ) {
    return json({ ok: true, ignored: event.type });
  }

  const intent = event.data.object as Stripe.PaymentIntent;
  const succeeded = event.type === "payment_intent.succeeded";

  // The PaymentIntent was created with metadata[payment_id] and
  // metadata[booking_id] in create-payment-intent. Look up the row.
  const paymentId = intent.metadata?.payment_id;
  const bookingId = intent.metadata?.booking_id;
  if (!paymentId || !bookingId) {
    console.error("stripe-webhook: PaymentIntent missing metadata", intent.id);
    return json({ error: "PaymentIntent missing booking metadata" }, 400);
  }

  // 1) Update the payments row.
  const { error: payErr } = await supabase
    .from("payments")
    .update({
      status: succeeded ? "succeeded" : "failed",
      raw_payload: { type: event.type, id: event.id, intent_id: intent.id },
    })
    .eq("id", paymentId);
  if (payErr) console.error("payments update failed", payErr);

  // 2) Flip the booking on success only.
  if (succeeded) {
    const { error: bookErr } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId);
    if (bookErr) console.error("bookings update failed", bookErr);
  }

  return json({ ok: true });
});
