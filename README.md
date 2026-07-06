# B&B Booking System — Frontend

Guest-facing frontend for a single-property B&B, built with Next.js 15 (App
Router), TypeScript, and Tailwind CSS, following `project.md`.

## Pages
- `/` — Landing page: hero, quick availability check, about, gallery preview, amenities, map, testimonials.
- `/property` — Full gallery, amenities, policies, map.
- `/booking` — 4-step booking flow: dates → guest details → payment → confirmation.
- `/reviews` — Testimonials and a contact form.

## Getting started
```bash
npm install
cp .env.example .env.local
npm run dev
```
Open http://localhost:3000.

## Connecting the backend
Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to your backend's URL (see the
accompanying `BACKEND_SETUP.md`). Without it, the frontend still runs and
demos correctly — the calendar uses mock unavailable dates, and payment
buttons show a clear message instead of failing silently.

Endpoints the frontend expects:
- `GET  /api/availability?month=YYYY-MM`
- `POST /api/bookings` (create a hold)
- `POST /api/payments/mpesa/stkpush`
- `POST /api/payments/stripe/checkout-session`
- `POST /api/payments/paypal/create-order`
- `POST /api/contact`

## Design tokens
Colors, fonts (Nunito / Quintessential), and spacing follow `project.md` and
are centralized in `tailwind.config.ts` and `app/globals.css`.

## Notes
- No emoji are used anywhere in the UI; all iconography is from `lucide-react`.
- All payment flows are wired for **sandbox/test mode only**.
