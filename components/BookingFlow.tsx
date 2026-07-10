"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarCheck,
  UserCheck,
  CreditCard,
  PartyPopper,
  Download,
  RotateCcw,
  Loader2,
  AlertCircle,
  Mail,
  MessageCircleMore,
} from "lucide-react";
import BookingCalendar from "@/components/BookingCalendar";
import PricingSummary, { computeTotals } from "@/components/PricingSummary";
import GuestForm, { GuestDetails } from "@/components/GuestForm";
import PaymentOptions, { type PaymentSuccess } from "@/components/PaymentOptions";
import { safeParseDateParam, safeParseGuestsParam } from "@/lib/safeDate";
import { createClient } from "@/lib/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabase/functions";
import { usePersistedState } from "@/lib/usePersistedState";
import { bookingReference, paymentReference } from "@/lib/reference";
import { downloadReceipt } from "@/lib/receipt";
import { property } from "@/lib/data";

type Step = 1 | 2 | 3 | 4;

const steps: { id: Step; label: string; icon: typeof CalendarCheck }[] = [
  { id: 1, label: "Dates", icon: CalendarCheck },
  { id: 2, label: "Guest info", icon: UserCheck },
  { id: 3, label: "Payment", icon: CreditCard },
  { id: 4, label: "Confirmation", icon: PartyPopper },
];

const EMPTY_GUEST: GuestDetails = { fullName: "", email: "", phone: "", notes: "" };

const DRAFT_KEYS = [
  "auracrib-booking-checkin",
  "auracrib-booking-checkout",
  "auracrib-booking-guests",
  "auracrib-booking-guest-details",
  "auracrib-booking-id",
  "auracrib-mpesa-phone",
  "auracrib-sms-phone",
];

export default function BookingFlow() {
  const params = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [verifying, setVerifying] = useState(false);

  const [checkInIso, setCheckInIso] = usePersistedState<string>("auracrib-booking-checkin", "");
  const [checkOutIso, setCheckOutIso] = usePersistedState<string>("auracrib-booking-checkout", "");
  const [guests, setGuests] = usePersistedState<number>("auracrib-booking-guests", 2);
  const [guestDetails, setGuestDetails] = usePersistedState<GuestDetails>(
    "auracrib-booking-guest-details",
    EMPTY_GUEST,
  );
  const [bookingId, setBookingId] = usePersistedState<string | null>("auracrib-booking-id", null);
  const [smsPhone] = usePersistedState<string>("auracrib-sms-phone", "");

  // Seed dates/guests from URL params exactly once, only if nothing is
  // already saved — otherwise a returning guest's restored draft would get
  // wiped by a stale bookmarked link.
  useEffect(() => {
    const urlCheckIn = safeParseDateParam(params.get("checkIn"));
    const urlCheckOut = safeParseDateParam(params.get("checkOut"));
    const urlGuests = params.get("guests");
    if (urlCheckIn && !checkInIso) setCheckInIso(format(urlCheckIn, "yyyy-MM-dd"));
    if (urlCheckOut && !checkOutIso) setCheckOutIso(format(urlCheckOut, "yyyy-MM-dd"));
    if (urlGuests && guests === 2) setGuests(safeParseGuestsParam(urlGuests));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkIn = safeParseDateParam(checkInIso || null);
  const checkOut = safeParseDateParam(checkOutIso || null);

  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentSuccess | null>(null);

  const totals = computeTotals(checkIn, checkOut);
  const { deposit } = totals;

  const canContinueFromStep1 = Boolean(checkIn && checkOut);
  const canContinueFromStep2 = Boolean(
    guestDetails.fullName && guestDetails.email && guestDetails.phone,
  );

  const bookingRef = bookingReference(bookingId);

  function receiptArgsFor(result: PaymentSuccess) {
    return {
      reference: bookingReference(bookingId),
      paymentId: result.transactionId,
      provider: result.provider,
      guestName: guestDetails.fullName,
      guestEmail: guestDetails.email,
      guestPhone: guestDetails.phone,
      checkIn: checkIn ? format(checkIn, "d MMM yyyy") : "—",
      checkOut: checkOut ? format(checkOut, "d MMM yyyy") : "—",
      guests,
      nights: totals.nights,
      subtotalKES: totals.subtotal,
      serviceFeeKES: totals.serviceFee,
      totalKES: totals.total,
      depositKES: totals.deposit,
      paidAt: format(new Date(), "d MMM yyyy, HH:mm"),
    };
  }

  function completeBooking(result: PaymentSuccess) {
    setPayment(result);
    setStep(4);

    // Fire the receipt automatically; a manual button is always shown too
    // in case the browser blocks the auto-download.
    setTimeout(() => downloadReceipt(receiptArgsFor(result)), 300);

    // Email + SMS are sent server-side, from mpesa-webhook / stripe-webhook
    // / paypal-capture, the moment each provider actually confirms the
    // charge — see MD/EMAIL_SMS_SETUP.md if they aren't arriving.
  }

  // Handles guests coming back from a Stripe or PayPal hosted checkout, and
  // confirms PayPal's capture (PayPal's API needs an explicit capture call
  // after the buyer approves — nothing else triggers that).
  useEffect(() => {
    const stripeStatus = params.get("stripe");
    const paypalStatus = params.get("paypal");
    const urlBookingId = params.get("bookingId");
    const stripeSessionId = params.get("session_id");
    const paypalToken = params.get("token"); // PayPal appends this = order id

    if (urlBookingId && !bookingId) setBookingId(urlBookingId);

    if (stripeStatus === "success" && stripeSessionId) {
      // Verify the Checkout Session with Stripe from an Edge Function before
      // showing success. This is a reliable fallback when a webhook is still
      // being delivered, while the webhook remains the normal confirmation
      // path.
      setVerifying(true);
      setStep(3);
      invokeEdgeFunction<{ status: string; transactionId?: string }>("stripe-confirm", {
        sessionId: stripeSessionId,
        bookingId: urlBookingId,
      })
        .then((data) => {
          setVerifying(false);
          if (data.status === "succeeded") {
            completeBooking({
              provider: "stripe",
              transactionId: data.transactionId ?? paymentReference("stripe", urlBookingId ?? bookingId),
              smsPhone,
            });
          } else {
            setBookingError("Stripe has not confirmed this payment yet. Please refresh in a moment.");
          }
        })
        .catch((err) => {
          setVerifying(false);
          setBookingError(
            err instanceof Error ? `Stripe confirmation failed: ${err.message}` : "Stripe confirmation failed. Please try again.",
          );
        });
    } else if (stripeStatus === "success") {
      setStep(3);
      setBookingError("Stripe returned without a checkout session ID. Please contact support with your booking reference.");
    } else if (stripeStatus === "cancel") {
      setStep(3);
      setBookingError("The card payment was cancelled. You can try again below.");
    } else if (paypalStatus === "return" && paypalToken) {
      setVerifying(true);
      setStep(3);
      invokeEdgeFunction<{ status: string }>("paypal-capture", { orderId: paypalToken })
        .then((data) => {
          setVerifying(false);
          if (data.status === "succeeded") {
            const ref = paymentReference("paypal", urlBookingId ?? bookingId);
            completeBooking({ provider: "paypal", transactionId: ref, smsPhone });
          } else {
            setBookingError("PayPal could not confirm this payment. Please try again.");
          }
        })
        .catch((err) => {
          setVerifying(false);
          setBookingError(
            err instanceof Error
              ? `PayPal confirmation failed: ${err.message}`
              : "PayPal confirmation failed. Please try again.",
          );
        });
    } else if (paypalStatus === "cancel") {
      setStep(3);
      setBookingError("The PayPal payment was cancelled. You can try again below.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinueToPayment() {
    if (!checkIn || !checkOut) return;
    setBookingSubmitting(true);
    setBookingError(null);

    try {
      const supabase = createClient();

      const { data: existing, error: rangesErr } = await supabase
        .from("booked_ranges")
        .select("check_in, check_out");
      if (rangesErr) throw new Error(`Could not verify availability: ${rangesErr.message}`);

      const overlaps = (existing ?? []).some((r) => {
        const rIn = new Date(`${r.check_in}T00:00:00`);
        const rOut = new Date(`${r.check_out}T00:00:00`);
        return checkIn < rOut && rIn < checkOut;
      });
      if (overlaps) {
        throw new Error("Those dates were just booked by someone else. Please pick different dates.");
      }

      const newBookingId = crypto.randomUUID();
      const { error } = await supabase.from("bookings").insert({
        id: newBookingId,
        check_in: format(checkIn, "yyyy-MM-dd"),
        check_out: format(checkOut, "yyyy-MM-dd"),
        guests,
        guest_name: guestDetails.fullName,
        guest_email: guestDetails.email,
        guest_phone: guestDetails.phone,
        nightly_rate: property.basePricePerNight,
        total_amount: totals.total,
        currency: property.currency,
        deposit_amount: totals.deposit,
        status: "pending_payment",
      });
      if (error) throw new Error(error.message);

      setBookingId(newBookingId);
      setStep(3);
    } catch (err) {
      setBookingError(
        err instanceof Error ? err.message : "Could not save your booking. Please try again.",
      );
    } finally {
      setBookingSubmitting(false);
    }
  }

  function handleManualDownload() {
    if (!payment) return;
    downloadReceipt(receiptArgsFor(payment));
  }

  function handleBookAgain() {
    if (typeof window !== "undefined") {
      DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
    }
    setCheckInIso("");
    setCheckOutIso("");
    setGuests(2);
    setGuestDetails(EMPTY_GUEST);
    setBookingId(null);
    setPayment(null);
    setBookingError(null);
    setStep(1);
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-14">
      <h1 className="text-4xl md:text-5xl text-earth-dark dark:text-cream text-center mb-3">
        Book your stay
      </h1>
      <p className="text-center text-ink/70 dark:text-cream/70 mb-10">
        A 15-minute hold is placed on your dates once you continue past this step.
      </p>

      {/* Stepper */}
      <ol className="flex items-center justify-center gap-2 md:gap-4 mb-12">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = step === s.id;
          const done = step > s.id;
          return (
            <li key={s.id} className="flex items-center gap-2 md:gap-4">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs md:text-sm font-bold ${
                  active
                    ? "bg-moss text-cream"
                    : done
                      ? "bg-moss/15 text-moss"
                      : "bg-earth/10 dark:bg-cream/10 text-ink/50 dark:text-cream/50"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && <span className="w-6 md:w-10 h-px bg-earth/20 dark:bg-cream/20" />}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 items-start">
          <div className="space-y-4">
            <BookingCalendar
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={(a, b) => {
                setCheckInIso(a ? format(a, "yyyy-MM-dd") : "");
                setCheckOutIso(b ? format(b, "yyyy-MM-dd") : "");
              }}
            />
            <div className="card p-5">
              <label htmlFor="guests-count" className="field-label-plain">
                Number of guests
              </label>
              <input
                id="guests-count"
                type="number"
                min={1}
                max={10}
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
                className="field-input w-24"
              />
            </div>
          </div>

          <div className="space-y-4">
            <PricingSummary checkIn={checkIn} checkOut={checkOut} guests={guests} />
            <button
              type="button"
              disabled={!canContinueFromStep1}
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-moss text-cream font-bold px-5 py-3 hover:bg-moss-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to guest details
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 items-start">
          <GuestForm value={guestDetails} onChange={setGuestDetails} />
          <div className="space-y-4">
            <PricingSummary checkIn={checkIn} checkOut={checkOut} guests={guests} />
            {bookingError && (
              <p className="flex items-start gap-2 text-sm text-earth-dark dark:text-gold-light">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                {bookingError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg border border-earth/20 dark:border-cream/20 font-bold px-5 py-3 hover:bg-earth/5 dark:hover:bg-cream/10 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!canContinueFromStep2 || bookingSubmitting}
                onClick={handleContinueToPayment}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-moss text-cream font-bold px-5 py-3 hover:bg-moss-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bookingSubmitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Continue to payment
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 items-start">
          {verifying ? (
            <div className="card p-10 text-center">
              <Loader2 className="w-8 h-8 text-moss mx-auto mb-4 animate-spin" aria-hidden="true" />
              <p className="font-bold text-earth-dark dark:text-cream">Confirming your PayPal payment...</p>
              <p className="text-sm text-ink/60 dark:text-cream/60 mt-1">This only takes a moment.</p>
            </div>
          ) : bookingId ? (
            <PaymentOptions
              amountKES={deposit}
              phone={guestDetails.phone}
              bookingId={bookingId}
              onPaid={completeBooking}
            />
          ) : (
            <div className="card p-6 text-sm text-ink/70 dark:text-cream/70">
              Your booking details weren&apos;t found — please go back and re-enter your dates and guest info.
            </div>
          )}
          <div className="space-y-4">
            <PricingSummary checkIn={checkIn} checkOut={checkOut} guests={guests} />
            {bookingError && (
              <p className="flex items-start gap-2 text-sm text-earth-dark dark:text-gold-light">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                {bookingError}
              </p>
            )}
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg border border-earth/20 dark:border-cream/20 font-bold px-5 py-3 hover:bg-earth/5 dark:hover:bg-cream/10 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === 4 && payment && (
        <div className="max-w-xl mx-auto text-center card p-10">
          <PartyPopper className="w-10 h-10 text-gold mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-3xl text-earth-dark dark:text-cream mb-2">Payment successful</h2>
          <p className="text-ink/70 dark:text-cream/70 mb-1">
            Booking reference <span className="font-bold text-earth-dark dark:text-cream">{bookingRef}</span>
          </p>
          <p className="text-xs text-ink/50 dark:text-cream/50 mb-6">Payment ID: {payment.transactionId}</p>

          <dl className="text-left text-sm bg-cream/60 dark:bg-ink/40 rounded-xl2 p-4 mb-6 space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-ink/70 dark:text-cream/70">Check-in</dt>
              <dd className="font-semibold text-earth-dark dark:text-cream">
                {checkIn ? format(checkIn, "d MMM yyyy") : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/70 dark:text-cream/70">Check-out</dt>
              <dd className="font-semibold text-earth-dark dark:text-cream">
                {checkOut ? format(checkOut, "d MMM yyyy") : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/70 dark:text-cream/70">Guests</dt>
              <dd className="font-semibold text-earth-dark dark:text-cream">{guests}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/70 dark:text-cream/70">Amount paid</dt>
              <dd className="font-semibold text-earth-dark dark:text-cream">KES {deposit.toLocaleString()}</dd>
            </div>
          </dl>

          <div className="flex items-center justify-center gap-2 text-xs text-ink/60 dark:text-cream/60 mb-6">
            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
            <MessageCircleMore className="w-3.5 h-3.5" aria-hidden="true" />
            A confirmation email and SMS are on their way to you.
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleManualDownload}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gold text-ink font-bold px-6 py-3 hover:bg-gold-light transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Download receipt
            </button>
            <button
              type="button"
              onClick={handleBookAgain}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-earth/20 dark:border-cream/20 font-bold px-6 py-3 hover:bg-earth/5 dark:hover:bg-cream/10 transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Book again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
