// stripe-confirm
//
// A verified return-page fallback for Stripe Checkout. Webhooks remain the
// primary confirmation path, but this function prevents a completed Checkout
// Session from leaving the CMS in Pending if the webhook is delayed.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

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

  let sessionId: string | undefined;
  let requestedBookingId: string | undefined;
  try {
    ({ sessionId, bookingId: requestedBookingId } = await req.json());
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!sessionId) return json({ error: "sessionId is required" }, 400);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });
    if (session.payment_status !== "paid") return json({ status: "pending" });

    const paymentIntent = session.payment_intent;
    const transactionId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
    const intentMetadata = typeof paymentIntent === "string" ? undefined : paymentIntent?.metadata;
    const paymentId = session.metadata?.payment_id ?? intentMetadata?.payment_id;
    const bookingId = session.metadata?.booking_id ?? intentMetadata?.booking_id;
    if (!paymentId || !bookingId || (requestedBookingId && requestedBookingId !== bookingId)) {
      return json({ error: "Stripe session is not linked to this booking" }, 400);
    }

    // Only the first successful transition should count as the payment
    // confirmation. Repeat calls/webhooks are harmless and return succeeded.
    const { data: transitioned, error: paymentError } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        provider_ref: transactionId ?? session.id,
        transaction_id: transactionId ?? session.id,
        raw_payload: { checkout_session_id: session.id, payment_status: session.payment_status },
      })
      .eq("id", paymentId)
      .eq("status", "initiated")
      .select("id")
      .maybeSingle();
    if (paymentError) return json({ error: paymentError.message }, 500);

    if (transitioned) {
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          payment_status: "Success",
          payment_method: "Stripe",
          transaction_id: transactionId ?? session.id,
        })
        .eq("id", bookingId);
      if (bookingError) return json({ error: bookingError.message }, 500);
    }

    return json({ status: "succeeded", transactionId: transactionId ?? session.id });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
