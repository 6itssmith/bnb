/**
 * Safely parses a `YYYY-MM-DD` style string (e.g. from URL search params)
 * into a Date, returning `null` for anything missing, malformed, or that
 * would otherwise produce an `Invalid Date`.
 *
 * Booking page fix: `BookingFlow` used to do
 * `new Date(params.get("checkIn")!)` directly. A malformed or unexpected
 * query string (hand-edited URL, stale bookmark, bad deep link) produced
 * an `Invalid Date`, which then threw inside `date-fns` calls
 * (`isBefore`, `format`, etc.) during render. Because that throw happened
 * *inside* the Suspense boundary's child, React had no error boundary to
 * fall back to, so the page stayed on the `Suspense` fallback
 * ("Loading booking form...") forever instead of showing the form or a
 * useful error. Parsing defensively here removes the crash at the source.
 */
export function safeParseDateParam(value: string | null): Date | null {
  if (!value) return null;
  // Expect YYYY-MM-DD; reject anything that doesn't match to avoid
  // timezone-shifted or nonsensical dates from free-form input.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function safeParseGuestsParam(value: string | null, fallback = 2): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 10);
}
