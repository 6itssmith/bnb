// paypal-capture
//
// The missing piece behind Update_Module.md's "bug in for paypal, it is
// exhibiting errors": `create-payment-intent` creates a PayPal order and
// sends the guest to PayPal's hosted approval page, but PayPal's v2 Orders
// API (intent: "CAPTURE") does NOT auto-capture funds just because the
// buyer approved — a server has to call
// `POST /v2/checkout/orders/{id}/capture` afterwards. Nothing in this repo
// did that, so approved PayPal orders were never actually captured,
// `PAYMENT.CAPTURE.COMPLETED` never fired, `paypal-webhook` never ran, and
// the booking never confirmed — the guest just landed back on the site
// with no success state and no obvious reason why.
//
// The frontend calls this the moment it detects the `?paypal=return`
// redirect (see components/BookingFlow.tsx), passing the `token` query
// param PayPal appends to the return_url — that token IS the order id.
//
// Required env vars: PAYPAL_ENV, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import { sendAllNotifications } from "../_shared/notify.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function reference(provider: string, bookingId: string) {
  return `AURACRIB-${provider.toUpperCase()}-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

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

function base64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function paypalAccessToken(base: string): Promise<string> {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let orderId: string | undefined;
  try {
    ({ orderId } = await req.json());
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!orderId) return json({ error: "orderId is required" }, 400);

  const env = Deno.env.get("PAYPAL_ENV") ?? "sandbox";
  const base = env === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  try {
    const token = await paypalAccessToken(base);

    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // PayPal requires this on repeat capture attempts (e.g. the guest
        // hits back/refresh) so we don't double-charge the same order.
        "PayPal-Request-Id": `capture-${orderId}`,
      },
    });
    const capture = await captureRes.json();

    // ORDER_ALREADY_CAPTURED means a previous attempt (or the webhook)
    // already finished this — treat it as success rather than an error.
    const alreadyCaptured =
      captureRes.status === 422 && capture?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED";

    if (!captureRes.ok && !alreadyCaptured) {
      throw new Error(capture?.message ?? `PayPal capture failed (${captureRes.status})`);
    }

    const succeeded = alreadyCaptured || capture.status === "COMPLETED";
    const purchaseUnit = capture.purchase_units?.[0];
    const captureObj = purchaseUnit?.payments?.captures?.[0];
    // These are the ids *we* set when creating the order in
    // create-payment-intent (`custom_id: paymentId`, `reference_id:
    // bookingId`) — PayPal echoes them back unchanged on the capture
    // response, so we can match our own rows exactly instead of guessing.
    const paymentId: string | undefined = captureObj?.custom_id ?? purchaseUnit?.custom_id;
    const bookingIdFromOrder: string | undefined = purchaseUnit?.reference_id;
    const captureId: string | undefined = captureObj?.id ?? orderId;

    let bookingId: string | null = bookingIdFromOrder ?? null;
    if (paymentId) {
      const { data: payment } = await supabase
        .from("payments")
        .select("id, booking_id")
        .eq("id", paymentId)
        .maybeSingle();

      if (payment) {
        bookingId = payment.booking_id;
        await supabase
          .from("payments")
          .update({
            status: succeeded ? "succeeded" : "failed",
            provider_ref: orderId,
            raw_payload: capture,
          })
          .eq("id", payment.id);

        if (succeeded) {
          const { data: booking } = await supabase
            .from("bookings")
            .update({ status: "confirmed", payment_method: "paypal" })
            .eq("id", payment.booking_id)
            .select()
            .maybeSingle();

          if (booking) {
            sendAllNotifications({
              reference: reference("paypal", booking.id),
              paymentId: captureId ?? reference("paypal", booking.id),
              provider: "paypal",
              guestName: booking.guest_name,
              guestEmail: booking.guest_email,
              smsPhone: booking.guest_phone,
              checkIn: booking.check_in,
              checkOut: booking.check_out,
              guests: booking.guests,
              depositKES: Number(booking.deposit_amount),
              totalKES: Number(booking.total_amount),
            }).catch((err) => console.error("send-notifications failed", err));
          }
        }
      }
    }

    return json({
      status: succeeded ? "succeeded" : "failed",
      transactionId: captureId,
      bookingId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 502);
  }
});
