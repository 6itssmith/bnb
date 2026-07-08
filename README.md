# Aura Crib — Guest-Facing Frontend

Single-property B&B booking site, built with Next.js 15 (App Router, static
export), TypeScript, and Tailwind CSS. Backend is Supabase (Postgres +
Edge Functions) for bookings, payments (M-Pesa/Stripe/PayPal sandbox), and
guest notifications (Resend email + Twilio SMS).

## Pages
- `/` — Landing page: hero, quick availability check, about, gallery preview, amenities, map, testimonials.
- `/property` — Full gallery, amenities, policies, map.
- `/booking` — 4-step booking flow: dates → guest details → payment → confirmation, with a downloadable receipt.
- `/reviews` — Testimonials and a contact form.

## Getting started
```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```
Open http://localhost:3000.

Without a configured Supabase project, the app still runs end-to-end in a
local sandbox mode: the calendar shows a few mock unavailable dates, and
payments are simulated client-side (clearly labelled) instead of calling a
real provider — see `lib/paymentSimulator.ts`.

## Backend (Supabase)
- `supabase/migrations/001_init.sql` — schema (`bookings`, `payments`, `booked_ranges` view, RLS).
- `supabase/functions/create-payment-intent` — starts an M-Pesa STK push, Stripe Checkout session, or PayPal order.
- `supabase/functions/mpesa-webhook`, `stripe-webhook` — confirm payment + flip booking status server-side.
- `supabase/functions/paypal-capture` — captures a PayPal order after buyer approval (PayPal's API requires an explicit capture call; nothing previously did this, which is why PayPal payments used to fail silently).
- `supabase/functions/send-notifications` — manual/standalone email+SMS sender (kept for a future "resend confirmation" admin action); the automatic send now happens directly from the webhook/capture functions above so it only fires once, and only once a payment is genuinely confirmed.
- `supabase/functions/_shared/notify.ts` — Resend + Twilio helpers shared by the above.

Deploy with the Supabase CLI:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy create-payment-intent
supabase functions deploy mpesa-webhook --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy paypal-capture
supabase functions deploy send-notifications
supabase secrets set MPESA_CONSUMER_KEY=... MPESA_CONSUMER_SECRET=... \
  MPESA_SHORTCODE=... MPESA_PASSKEY=... MPESA_CALLBACK_URL=... \
  STRIPE_SECRET_KEY=... PAYPAL_ENV=sandbox PAYPAL_CLIENT_ID=... \
  PAYPAL_CLIENT_SECRET=... SITE_URL=https://yoursite.com \
  RESEND_API_KEY=... RESEND_FROM_EMAIL=bookings@auracrib.co.ke \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=...
```

## What changed in this pass (Update_Module.md, guest-facing section)
- **Branding** — renamed to Aura Crib everywhere (title, navbar, footer, metadata), wired up the supplied logo (with a dark-mode swap) and favicon/app-icon set.
- **Dark mode** — every card, form, heading, and border now has an explicit `dark:` variant via shared `.card` / `.field-input` / `.field-label` classes in `app/globals.css`, instead of the previous inconsistent per-component styling.
- **Persistence** — `lib/usePersistedState.ts` backs the booking draft (dates, guests, guest details), the M-Pesa/SMS phone fields, and the contact form with localStorage, so a reload never wipes them.
- **Stripe/PayPal bug** — Stripe's and PayPal's hosted checkout redirect the guest away from the site; nothing previously handled the redirect back, so a successful payment looked broken. `BookingFlow.tsx` now reads the `stripe=success` / `paypal=return` redirect and — for PayPal specifically — a new `paypal-capture` function performs the capture step PayPal's API requires but which nothing was doing before.
- **Success page + receipt** — a dedicated confirmation step shows the booking summary and auto-downloads a standalone HTML receipt (`lib/receipt.ts`), with a manual "Download receipt" button as a fallback if the browser blocks the automatic one.
- **Payment IDs** — every reference shown to the guest is `AURACRIB-<CODE>` or `AURACRIB-<PROVIDER>-<CODE>` (`lib/reference.ts`), never a bare random string.
- **Email + SMS** — Resend and Twilio are wired into the webhook/capture functions, firing once a payment is genuinely confirmed server-side.

## Notes
- No emoji are used anywhere in the UI; all iconography is from `lucide-react`.
- All payment flows are sandbox/test mode only.
