# Payments & DB — Why Nothing Actually Works

**Repo:** `/Users/6_its.smith/Desktop/BNB_DEMO`
**Date:** 2026-07-07
**Status:** Diagnosis only — no code changes.

The frontend looks complete (booking flow, calendar, payment buttons all render
and click), but **the booking flow does not persist a single row to a database
and no payment provider is actually called**. This file lays out the chain of
reasons, in the order a request would hit them.

---

## TL;DR

| Surface | What's there | What's missing | Net result |
|---|---|---|---|
| Database | SQL file describing tables, Supabase project linked | Migration never applied; tables do not exist in the cloud | Every DB query fails with "relation does not exist" |
| Authenticated booking insert | `booked_ranges` view, RLS policy for `anon` insert | Frontend never calls `supabase.from("bookings").insert(...)` — there is no submit handler | Bookings are not saved at all |
| Payment intent | Edge Function folder `create-payment-intent` | `index.ts` is a **0-byte empty file** | No Stripe/M-Pesa/PayPal request is ever sent |
| Payment webhooks | Folders for `mpesa-webhook`, `stripe-webhook`, `paypay-webhook` | All `index.ts` files are **0 bytes** | Even if a provider *did* call back, nothing would handle it |
| Backend HTTP API | `components/PaymentOptions.tsx` POSTs to `${API_BASE}/api/payments/...` | No Express/Next route handlers exist; `bnb-backend/` has zero `.ts`/`.js` source files and no `node_modules` | All payment requests return 404 (or CORS-reject) |
| Env wiring | `lib/supabase/{client,server,admin}.ts` exists | `@supabase/supabase-js` and `@supabase/ssr` are **not installed** in `package.json` | Importing those modules crashes the build |
| M-Pesa creds | `MPESA_PASSKEY` and `MPESA_CALLBACK_URL` set to placeholder text in `.env` | Sandbox passkey is literally `<sandbox passkey>`, callback URL is `https://<project-ref>.functions.supabase.co/mpesa-webhook` (unsubstituted) | Daraja would reject any real call anyway |

---

## 1. The Database Doesn't Exist

**Files involved:** `supabase/migrations/001_init.sql`, `supabase/migrations/20260706214241_init.sql`, `supabase/config.toml`

- `supabase/migrations/001_init.sql` contains a valid schema (tables `bookings`, `payments`, `blocked_dates`, `contact_messages`, plus an index).
- `supabase/migrations/20260706214241_init.sql` is **empty (0 bytes)**.
- `supabase/config.toml` is **empty (0 bytes)** — Supabase's CLI normally uses it to track project settings.
- `.temp/project-ref` shows the project *is* linked (`vfzpfiwvndivjapudfwd`), but no `supabase db push` was ever run. **None of the tables in `001_init.sql` exist in the cloud project.**
- The RLS policies and the `booked_ranges` view described in `SUPABASE_ARCHITECTURE.md` are therefore not deployed either.

**Effect on the user:** If you wired `BookingCalendar` to query `booked_ranges` (per the architecture doc), every call would 400 with
`relation "public.booked_ranges" does not exist`. Nothing reads/writes Supabase from the frontend today, so this is silent — but it is the next thing that breaks the moment you try to make the calendar real.

**Fix:** Either (a) run `npx supabase db push` after filling out `supabase/config.toml`, or (b) paste `001_init.sql` into the Supabase SQL editor and execute it by hand. The empty `20260706214241_init.sql` should be removed so it doesn't shadow the real one.

---

## 2. The Frontend Never Inserts a Booking

**File:** `components/GuestForm.tsx`

`GuestForm` is a **purely controlled form** — `value` and `onChange` are passed in as props, and the component itself has zero submit logic, no `useState` for the values, and no `onSubmit` on the `<form>`. Look at lines 17–85: there is no `<form>` element at all, and no parent wires one up either. `BookingFlow` (`components/BookingFlow.tsx`) just advances `step` from 2 → 3 when the fields are filled in; it never calls `supabase.from('bookings').insert(...)`.

**Effect on the user:** Step 3 ("Payment") is reached without any `bookings` row in Supabase. When the payment succeeds there's nothing to update, so the "Booking held" screen on step 4 lies — no hold was ever placed, no reference number was registered, the 15-minute countdown mentioned on the page is fiction.

**Fix:** Add a real submit (e.g. a `Continue to payment` button that calls `lib/supabase/client.ts`'s `createClient()` and inserts into `bookings` with `status: 'pending_payment'`, capturing the returned `id` and passing it down to `PaymentOptions`).

---

## 3. The Backend HTTP API Doesn't Exist

**File:** `components/PaymentOptions.tsx` (lines 20, 32–37, 53–57, 77–81)

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
// ...
await fetch(`${API_BASE}/api/payments/mpesa/stkpush`,   { method: "POST", ... })
await fetch(`${API_BASE}/api/payments/stripe/checkout-session`, { ... })
await fetch(`${API_BASE}/api/payments/paypal/create-order`, { ... })
```

The README and the docstring in `PaymentOptions.tsx` describe a Next.js Route Handler (or Express) at `app/api/payments/...`, but:

- **There is no `app/api/` directory.** `find app -type f` returns only the four page files (`layout.tsx`, `page.tsx`, `globals.css`, and the three `*/page.tsx` routes). Zero route handlers.
- **`bnb-backend/` is empty** — it has `package.json`, `tsconfig.json`, `.env`, `.gitignore`, and a now-empty `prisma/` folder, but **no source files** and no `node_modules`. There is literally no Express server to run, and `npm install` has never been executed in that directory.
- **`app/api/create-payment/route.ts`** — the Route Handler that `SUPABASE_ARCHITECTURE.md` §5 says should call the `create-payment-intent` Edge Function — does not exist.

**Effect on the user:** Every "Pay" button resolves to `fetch("", { ... })` or `fetch(undefined, { ... })`, which throws a `TypeError: Failed to construct URL`. The catch in `PaymentOptions.tsx` swallows it and renders:
> *"Could not reach the payment backend. Connect NEXT_PUBLIC_API_BASE_URL to the Daraja sandbox endpoint described in BACKEND_SETUP.md."*

This is the error you are seeing.

**Fix:** Implement `app/api/payments/[provider]/route.ts` (or the Express routes in `bnb-backend/`) that uses `lib/supabase/admin.ts` and the `create-payment-intent` Edge Function. Until that exists, the payment UI cannot be wired to anything.

---

## 4. The Edge Functions Are Empty Files

**Files:** `supabase/functions/create-payment-intent/index.ts`, `supabase/functions/mpesa-webhook/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/paypal-webhook/index.ts` (note the typo: folder is `paypay-webhook` not `paypal-webhook`)

All four `index.ts` files are **0 bytes**. `supabase functions deploy` would either fail (no `Deno.serve` entry point) or, if it accepted an empty file, deploy a function that returns `""` with status 200 — meaning provider webhooks would silently 200 with no DB update.

**Effect on the user:** Even if you fixed §3 and the frontend successfully called `${SUPABASE_URL}/functions/v1/create-payment-intent`, that function would be a no-op. Even if M-Pesa/Stripe/PayPal did call back their respective webhook URLs, those would be no-ops too — no signature verification, no `payments` row update, no `bookings.status` flip to `confirmed`.

**Typo worth flagging:** `supabase/functions/paypay-webhook/` should be `paypal-webhook/`. The typo means the deployed URL would be `…/functions/v1/paypay-webhook` and `SUPABASE_ARCHITECTURE.md` §5 says it should be `paypal-webhook`. Pick one name and stick with it; right now the docs and the folder disagree.

**Fix:** Write the four functions (the architecture doc has the contract). At minimum, each needs:
- `Deno.serve(async (req) => { ... })` entry
- HMAC/signature verification using the provider's webhook secret
- An update to `payments` and `bookings` via the service-role key

---

## 5. The Supabase JS Libraries Aren't Installed

**Files:** `package.json` (root), `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

- `package.json` has no `@supabase/supabase-js` or `@supabase/ssr` in `dependencies` or `devDependencies`. The only runtime deps are `next`, `react`, `react-dom`, `lucide-react`, `date-fns`, `aos`.
- `node_modules/@supabase/` does not exist.
- And yet `lib/supabase/{client,server,admin}.ts` import from `@supabase/ssr` and `@supabase/supabase-js`. Nothing in the codebase actually **uses** these three files yet (`grep -r "lib/supabase" app/ components/` returns nothing) — so the build doesn't fail at compile time. The moment any component or route handler imports from `lib/supabase/*`, you'll get a "Module not found" error and a 500.

**Effect on the user:** Latent. Build passes because nothing references the Supabase clients. The instant you wire `BookingCalendar` to `booked_ranges` (the documented plan), everything breaks.

**Fix:** `npm install @supabase/supabase-js @supabase/ssr` in the frontend. Add them to `package.json` so a fresh clone can `npm install` and build.

---

## 6. The Prisma Backend Is a Phantom

**Files:** `bnb-backend/package.json`, `bnb-backend/prisma/` (empty directory), `bnb-backend/.env`

- `bnb-backend/package.json` declares `@prisma/client`, `prisma`, `express`, `axios`, `dotenv`, `cors`, `nodemailer`, `zod`, `ts-node-dev`, `typescript`.
- `bnb-backend/prisma/` exists but is **empty** — no `schema.prisma`. The recent commit message ("chore: remove leftover prisma files and ignore backend in tsconfig") confirms these were deliberately deleted.
- `bnb-backend/.env` has a placeholder `DATABASE_URL="postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public"` — never a real DB.
- `bnb-backend/node_modules` doesn't exist — `npm install` was never run here.

**Effect on the user:** None directly — but if anyone follows the older `BACKEND_SETUP.md`-style instructions (now removed) and tries `npx prisma generate`, they get "no schema found." This directory is effectively a tombstone. Per `SUPABASE_ARCHITECTURE.md` §7 step 8, the plan is to **delete `bnb-backend/`** once Supabase is fully wired. That hasn't happened.

**Fix:** Either delete `bnb-backend/` (recommended — it's referenced as deleted anyway) or revive it with a real schema. Don't keep it half-dead.

---

## 7. Env Vars Have Placeholder Strings, Not Real Values

**File:** `.env`

```env
MPESA_PASSKEY=<sandbox passkey>
MPESA_CALLBACK_URL=https://<project-ref>.functions.supabase.co/mpesa-webhook
```

Both values are template placeholders that were never substituted. Real values are required even for sandbox:

- `MPESA_PASSKEY` must be the literal sandbox passkey published in Safaricom's Daraja docs ("Lipa na M-Pesa Online Sandbox" page). It's a public string, not a secret, but it still has to be there.
- `MPESA_CALLBACK_URL` has `<project-ref>` literally in it — Safaricom's sandbox will refuse the STK push if it can't POST the result back. The substitution is `vfzpfiwvndivjapudfwd.functions.supabase.co` based on the linked project.

Also note: `MPESA_CALLBACK_URL` points at an Edge Function that doesn't exist yet (§4) and `BOOKING_CREATE_HANDLER` is not set. Without a working webhook receiver, the STK push fires but the booking never flips to `confirmed`.

The Stripe keys (`sk_test_...` / `pk_test_...`) look real, but without a working backend (§3) and webhook handler (§4) they're just strings.

**Effect on the user:** When §3 is fixed and an STK push is finally attempted, Daraja will reject it with an "invalid passkey" or "invalid callback URL" error. The frontend's catch will again show the generic "Could not reach the payment backend" message — masking the real reason.

**Fix:** Replace `<sandbox passkey>` with the published Daraja sandbox passkey; replace `<project-ref>` with `vfzpfiwvndivjapudfwd`. Document both in `.env.example`.

---

## 8. The Availability Is Fake and the Calendar Doesn't Read Supabase

**File:** `components/BookingCalendar.tsx` (lines 20–24)

```ts
const MOCK_UNAVAILABLE = new Set<string>([
  format(addMonths(new Date(), 0), "yyyy-MM-") + "18",
  format(addMonths(new Date(), 0), "yyyy-MM-") + "19",
  format(addMonths(new Date(), 1), "yyyy-MM-") + "02",
]);
```

The calendar greys out three hard-coded dates relative to "today" (whatever day this runs). There's no fetch to `/api/availability` (the README claims it) and no Supabase query to `booked_ranges` (the architecture doc claims it). Two confirmed bookings and the calendar will show the wrong available dates.

**Effect on the user:** Subtle — the booking flow *appears* to work, but two guests can pick the same dates and the system will let both of them through. There's no double-booking protection because there's no booking at all (per §2).

**Fix:** Replace `MOCK_UNAVAILABLE` with a `useEffect` that calls `supabase.from('booked_ranges').select(...)` and `supabase.from('blocked_dates').select(...)`, gated on the migration being applied (§1).

---

## 9. Contact Form Is Also a No-Op

**File:** `components/ContactForm.tsx` (lines 9–13)

```ts
function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  // Wire this to POST /api/contact (see BACKEND_SETUP.md) to forward to email/CRM.
  setSent(true);
}
```

Comment literally says "Wire this to POST /api/contact". There is no such route, and the form input fields are uncontrolled (no `name` or `value`/`onChange`). Submitting shows a success state but the data goes nowhere. Same for the `contact_messages` table in §1 — even if you wired it, the table doesn't exist yet.

**Effect on the user:** Guests think they sent a message. The owner never receives it.

---

## Suggested Order of Operations to Actually Make It Work

1. **Install the Supabase JS libs** (`npm install @supabase/supabase-js @supabase/ssr`).
2. **Apply the migration** — push `supabase/migrations/001_init.sql` (delete the empty `20260706214241_init.sql` first; fill in `config.toml` if you want to use the CLI).
3. **Decide on the PayPal folder name** — rename `paypay-webhook` → `paypal-webhook` and update the architecture doc accordingly.
4. **Write the four Edge Functions** (intent + three webhooks) with real bodies. Deploy with `supabase functions deploy <name>`.
5. **Build the booking insert path** — wire `GuestForm` (or the step transition in `BookingFlow`) to insert a `bookings` row with `status: 'pending_payment'` and capture the returned `id`.
6. **Build the API layer** the frontend expects — either `app/api/payments/...` route handlers (uses Edge Function from §4) or revive `bnb-backend/` with real Express routes. The current `fetch("")` calls in `PaymentOptions.tsx` need a real URL.
7. **Fix the env placeholders** — `MPESA_PASSKEY` and `MPESA_CALLBACK_URL`.
8. **Wire `BookingCalendar`** to `booked_ranges` + `blocked_dates` from Supabase.
9. **Delete `bnb-backend/`** (per the architecture doc's step 8) — it's dead weight that confuses the next reader.
10. **Wire the ContactForm** to insert into `contact_messages`.

Without steps 1–6, **nothing in the booking or payment flow touches a real backend**. The rest is just dressing on a demo.

---

## Status — 2026-07-07

All 10 steps above are done. Notes on how, since a couple of them didn't go exactly as originally sketched:

1. ✅ `@supabase/supabase-js` + `@supabase/ssr` installed.
2. ✅ `001_init.sql` applied; the empty duplicate migration is gone.
3. ✅ `paypay-webhook` → `paypal-webhook` (already consistent with this doc and `SUPABASE_ARCHITECTURE.md`).
4. ✅ All four Edge Functions written and fixed up (see `git log` / diffs): the M-Pesa STK password timestamp now uses Africa/Nairobi time instead of UTC (Daraja was rejecting it), the base64 helper no longer relies on non-portable `escape`/`unescape`, and Stripe now creates a hosted **Checkout Session** instead of a raw PaymentIntent (see note on step 6 below for why).
5. ✅ `BookingFlow.tsx` now inserts a real `bookings` row (status `pending_payment`) before advancing to payment, including a best-effort overlap check against `booked_ranges` (not atomic — see the code comment; a DB exclusion constraint would be the real fix, tracked separately).
6. ⚠️ **Changed from the original plan.** `next.config.js` has `output: "export"` (static export) — there is no Next.js server at runtime, so `app/api/*` Route Handlers and `bnb-backend/`'s Express server were never going to work here regardless of whether someone wrote the code. Instead, `PaymentOptions.tsx` calls the `create-payment-intent` Edge Function **directly from the browser** (`lib/supabase/functions.ts`), authenticated with the anon key. This keeps the static-export architecture intact and needs no server host beyond Supabase.
7. ✅ `MPESA_PASSKEY` filled with Safaricom's published sandbox passkey for shortcode `174379`; `MPESA_CALLBACK_URL` substituted with the real project ref. Also added the PayPal/Stripe-webhook/`SITE_URL` env vars the Edge Functions need, which were missing entirely.
8. ✅ `BookingCalendar.tsx` now loads `booked_ranges` + `blocked_dates` from Supabase on mount instead of using `MOCK_UNAVAILABLE`.
9. ✅ `bnb-backend/` is already gone from the repo.
10. ✅ `ContactForm.tsx` now inserts into `contact_messages`, with controlled inputs and error/loading states.

**Still open / worth knowing about, not part of the original 10:**
- No DB-level double-booking protection (exclusion constraint) — only the client-side best-effort check from step 5.
- The "15-minute hold" copy on the booking page is still aspirational — nothing currently expires a stale `pending_payment` row. Would need a scheduled Edge Function (`pg_cron` or a periodic invoke) to flip abandoned bookings to `cancelled`.
- `next tsc`/`next build` type-checking is clean; the only build failure in this sandbox is the pre-existing font-fetch network restriction noted in `FIXES.md`, unrelated to this pass.
