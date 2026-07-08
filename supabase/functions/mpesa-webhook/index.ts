// mpesa-webhook
//
// Daraja async callback. Safaricom POSTs the STK push result here after
// the customer enters (or rejects) their M-Pesa PIN. We:
//
//   1. Read Body.stkCallback
//   2. Look up the payments row by CheckoutRequestID (== provider_ref)
//   3. On ResultCode 0: mark payments.status='succeeded' + bookings.status='confirmed'
//      On any other code: mark payments.status='failed' (booking stays pending)
//   4. Store the raw body on payments.raw_payload for audit
//
// We do NOT verify a signature (Daraja doesn't sign webhooks; the accepted
// mitigations are IP allow-listing and a unique CallBackURL per environment).
// If you need stronger guarantees, the CallBackURL can be hardened with a
// shared secret in the query string and checked here.

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type DarajaCallback = {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: DarajaCallback;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) {
    return json({ error: "missing stkCallback" }, 400);
  }

  // Pull out M-Pesa's metadata (Amount, MpesaReceiptNumber, Phone, etc.) if present.
  const items = cb.CallbackMetadata?.Item ?? [];
  const meta: Record<string, string | number> = {};
  for (const item of items) if (item.Value !== undefined) meta[item.Name] = item.Value;

  const succeeded = cb.ResultCode === 0;

  // 1) Find the payments row we created when the STK push was issued.
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, booking_id")
    .eq("provider_ref", cb.CheckoutRequestID)
    .single();

  if (payErr || !payment) {
    // We can't tie this callback to a payment. Log and 200 so Daraja doesn't retry.
    console.error("mpesa-webhook: no payment for", cb.CheckoutRequestID, payErr);
    return json({ ok: true, note: "no matching payment" });
  }

  // 2) Update the payments row.
  const { error: payUpdErr } = await supabase
    .from("payments")
    .update({
      status: succeeded ? "succeeded" : "failed",
      raw_payload: { ...payload, _meta: meta },
    })
    .eq("id", payment.id);
  if (payUpdErr) console.error("payments update failed", payUpdErr);

  // 3) Flip the booking status on success only, then notify the guest.
  if (succeeded) {
    const { data: booking, error: bookUpdErr } = await supabase
      .from("bookings")
      .update({ status: "confirmed", payment_method: "mpesa" })
      .eq("id", payment.booking_id)
      .select()
      .maybeSingle();
    if (bookUpdErr) console.error("bookings update failed", bookUpdErr);

    if (booking) {
      const receiptNumber = (meta["MpesaReceiptNumber"] as string) ?? reference("mpesa", booking.id);
      sendAllNotifications({
        reference: reference("mpesa", booking.id),
        paymentId: receiptNumber,
        provider: "mpesa",
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

  return json({ ok: true });
});
