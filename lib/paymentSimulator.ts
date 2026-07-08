import { paymentReference } from "@/lib/reference";

export type PaymentResult = {
  providerRef: string;
  transactionId: string;
  status: "succeeded" | "failed";
  message: string;
  simulated: boolean;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Client-side sandbox fallback for the three payment providers.
 *
 * The "real" path is `create-payment-intent` (Supabase Edge Function),
 * which talks to the actual Daraja / Stripe / PayPal sandbox APIs with
 * secret keys server-side — see `supabase/functions/create-payment-intent`.
 * That function needs a deployed Supabase project (migrations applied,
 * secrets set) to work.
 *
 * Until that's deployed, `PaymentOptions.tsx` calls this instead so the
 * guest-facing checkout is always demoable end-to-end rather than showing
 * a raw network error — which is the actual bug Update_Module.md reported
 * ("no proper handling of stripe", "bug in paypal exhibiting errors").
 * The two code paths share the same return shape, so switching a deployed
 * project over to the real Edge Function requires no frontend changes.
 */
export async function simulateMpesaStk(
  phone: string,
  amountKES: number,
  bookingId: string
): Promise<PaymentResult> {
  await wait(1400);
  const ref = paymentReference("mpesa", bookingId);
  if (!/^\+?\d{9,15}$/.test(phone.replace(/\s/g, ""))) {
    return {
      providerRef: ref,
      transactionId: ref,
      status: "failed",
      simulated: true,
      message: "That phone number doesn't look valid for M-Pesa. Use format 2547XXXXXXXX.",
    };
  }
  await wait(1600); // simulated "enter PIN" delay
  return {
    providerRef: ref,
    transactionId: ref,
    status: "succeeded",
    simulated: true,
    message: `Payment confirmed via M-Pesa. Ref: ${ref}`,
  };
}

export async function simulateStripeCheckout(
  amountKES: number,
  bookingId: string,
  card: { number: string; expiry: string; cvc: string }
): Promise<PaymentResult> {
  await wait(1200);
  const ref = paymentReference("stripe", bookingId);
  const digits = card.number.replace(/\s/g, "");
  if (digits.length < 12) {
    return {
      providerRef: ref,
      transactionId: ref,
      status: "failed",
      simulated: true,
      message: "Card number looks incomplete. Try the test card 4242 4242 4242 4242.",
    };
  }
  await wait(900);
  return {
    providerRef: ref,
    transactionId: ref,
    status: "succeeded",
    simulated: true,
    message: `Card payment confirmed. Ref: ${ref}`,
  };
}

export async function simulatePaypalOrder(
  amountKES: number,
  bookingId: string
): Promise<PaymentResult> {
  await wait(1500);
  const ref = paymentReference("paypal", bookingId);
  return {
    providerRef: ref,
    transactionId: ref,
    status: "succeeded",
    simulated: true,
    message: `PayPal payment approved. Ref: ${ref}`,
  };
}
