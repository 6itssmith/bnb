"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarCheck,
  UserCheck,
  CreditCard,
  PartyPopper,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import BookingCalendar from "@/components/BookingCalendar";
import PricingSummary, { computeTotals } from "@/components/PricingSummary";
import GuestForm, { GuestDetails } from "@/components/GuestForm";
import PaymentOptions from "@/components/PaymentOptions";
import { safeParseDateParam, safeParseGuestsParam } from "@/lib/safeDate";
import { createClient } from "@/lib/supabase/client";
import { property } from "@/lib/data";

type Step = 1 | 2 | 3 | 4;

const steps: { id: Step; label: string; icon: typeof CalendarCheck }[] = [
  { id: 1, label: "Dates", icon: CalendarCheck },
  { id: 2, label: "Guest info", icon: UserCheck },
  { id: 3, label: "Payment", icon: CreditCard },
  { id: 4, label: "Confirmation", icon: PartyPopper },
];

export default function BookingFlow() {
  const params = useSearchParams();
  const [step, setStep] = useState<Step>(1);

  const [checkIn, setCheckIn] = useState<Date | null>(
    safeParseDateParam(params.get("checkIn")),
  );
  const [checkOut, setCheckOut] = useState<Date | null>(
    safeParseDateParam(params.get("checkOut")),
  );
  const [guests, setGuests] = useState<number>(
    safeParseGuestsParam(params.get("guests")),
  );

  const [guestDetails, setGuestDetails] = useState<GuestDetails>({
    fullName: "",
    email: "",
    phone: "",
    notes: "",
  });

  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const totals = computeTotals(checkIn, checkOut);
  const { deposit } = totals;

  const canContinueFromStep1 = Boolean(checkIn && checkOut);
  const canContinueFromStep2 = Boolean(
    guestDetails.fullName && guestDetails.email && guestDetails.phone,
  );

  // Reference shown on the confirmation screen. Falls back to a
  // placeholder until the real booking row exists; the first 8 characters
  // of the UUID are enough to be a usable human reference.
  const bookingRef = bookingId
    ? bookingId.slice(0, 8).toUpperCase()
    : "PENDING";

  async function handleContinueToPayment() {
    if (!checkIn || !checkOut) return;
    setBookingSubmitting(true);
    setBookingError(null);

    try {
      const supabase = createClient();

      // Best-effort overlap check against the public booked_ranges view.
      // NOTE: this is not atomic — two guests submitting at the same
      // instant could still both pass this check. Real double-booking
      // protection needs a DB-level exclusion constraint (see
      // PAYMENT_DB_FINDINGS.md §8); this only catches the common case and
      // gives a fast, friendly error for it.
      const { data: existing, error: rangesErr } = await supabase
        .from("booked_ranges")
        .select("check_in, check_out");
      if (rangesErr)
        throw new Error(`Could not verify availability: ${rangesErr.message}`);

      const overlaps = (existing ?? []).some((r) => {
        const rIn = new Date(`${r.check_in}T00:00:00`);
        const rOut = new Date(`${r.check_out}T00:00:00`);
        return checkIn < rOut && rIn < checkOut;
      });
      if (overlaps) {
        throw new Error(
          "Those dates were just booked by someone else. Please pick different dates.",
        );
      }

// We generate the id client-side and skip .select() on purpose:
      // anon intentionally has no SELECT policy on `bookings` (guests
      // shouldn't be able to browse each other's bookings), and
      // `.select()` after `.insert()` makes PostgREST do an
      // `INSERT ... RETURNING`, which Postgres RLS treats as a SELECT on
      // the new row. With no permissive SELECT policy for anon, that
      // RETURNING check fails — surfacing as the *same* "new row violates
      // row-level security policy" error a failed WITH CHECK would give,
      // even though the insert itself is fully permitted. Not needing the
      // row back avoids the whole problem.
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
        err instanceof Error
          ? err.message
          : "Could not save your booking. Please try again.",
      );
    } finally {
      setBookingSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-14">
      <h1 className="text-4xl md:text-5xl text-earth-dark text-center mb-3">
        Book your stay
      </h1>
      <p className="text-center text-ink/70 mb-10">
        A 15-minute hold is placed on your dates once you continue past this
        step.
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
                      : "bg-earth/10 text-ink/50"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <span className="w-6 md:w-10 h-px bg-earth/20" />
              )}
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
                setCheckIn(a);
                setCheckOut(b);
              }}
            />
            <div className="card p-5">
              <label
                htmlFor="guests-count"
                className="text-xs font-bold text-earth-dark mb-1.5 block"
              >
                Number of guests
              </label>
              <input
                id="guests-count"
                type="number"
                min={1}
                max={10}
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
                className="w-24 rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
              />
            </div>
          </div>

          <div className="space-y-4">
            <PricingSummary
              checkIn={checkIn}
              checkOut={checkOut}
              guests={guests}
            />
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
            <PricingSummary
              checkIn={checkIn}
              checkOut={checkOut}
              guests={guests}
            />
            {bookingError && (
              <p className="flex items-start gap-2 text-sm text-earth-dark">
                <AlertCircle
                  className="w-4 h-4 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                {bookingError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg border border-earth/20 font-bold px-5 py-3 hover:bg-earth/5 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!canContinueFromStep2 || bookingSubmitting}
                onClick={handleContinueToPayment}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-moss text-cream font-bold px-5 py-3 hover:bg-moss-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bookingSubmitting && (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Continue to payment
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && bookingId && (
        <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 items-start">
          <PaymentOptions
            amountKES={deposit}
            phone={guestDetails.phone}
            bookingId={bookingId}
            onPaid={() => setStep(4)}
          />
          <div className="space-y-4">
            <PricingSummary
              checkIn={checkIn}
              checkOut={checkOut}
              guests={guests}
            />
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg border border-earth/20 font-bold px-5 py-3 hover:bg-earth/5 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="max-w-xl mx-auto text-center card p-10">
          <PartyPopper
            className="w-10 h-10 text-gold mx-auto mb-4"
            aria-hidden="true"
          />
          <h2 className="text-3xl text-earth-dark mb-2">Booking held</h2>
          <p className="text-ink/70 mb-6">
            Reference{" "}
            <span className="font-bold text-earth-dark">{bookingRef}</span> — a
            confirmation and receipt have been sent to{" "}
            {guestDetails.email || "your email"}.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-bold px-6 py-3 hover:bg-gold-light transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download receipt
          </button>
        </div>
      )}
    </div>
  );
}
