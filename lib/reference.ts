const COMPANY_TAG = "AURACRIB";

/** Short, human-friendly, collision-resistant suffix (not a raw UUID/Math.random string). */
function shortCode(seed?: string): string {
  const base = seed ? seed.replace(/-/g, "").toUpperCase() : "";
  if (base.length >= 6) return base.slice(0, 6);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return (base + random).slice(0, 6);
}

/** Booking reference shown throughout the guest journey, e.g. "AURACRIB-4F9A2C". */
export function bookingReference(bookingId?: string | null): string {
  return `${COMPANY_TAG}-${shortCode(bookingId ?? undefined)}`;
}

/**
 * Payment/transaction id shown on receipts and provider references
 * (M-Pesa AccountReference, Stripe/PayPal metadata), e.g.
 * "AURACRIB-MPESA-4F9A2C" instead of a raw provider string or
 * Math.random() output — this is what Update_Module.md item #5 asks for.
 */
export function paymentReference(
  provider: "mpesa" | "stripe" | "paypal",
  bookingId?: string | null
): string {
  return `${COMPANY_TAG}-${provider.toUpperCase()}-${shortCode(bookingId ?? undefined)}`;
}
