# BNB_DEMO — Design Review, Cons, & Phased Fix Plan

Date: 2026-07-06
Scope: `bnb-booking-frontend` (Next.js 15 App Router, TS, Tailwind) + `bnb-backend` (Express 5, Prisma 7, Zod, Nodemailer, Axios)

---

## 1. Current design at a glance

### Frontend (`bnb-booking-frontend`)
- **Stack:** Next.js 15 App Router, React 18, TypeScript (strict), Tailwind 3.4, `lucide-react`, `date-fns`. Google Fonts (Nunito body, Quintessential display).
- **Pages**
  - `/` — hero, about, gallery preview (6 of 6), amenities, OSM map, testimonials, CTA.
  - `/property` — full gallery, amenities, policies, map.
  - `/booking` — 4-step flow: `Dates → Guest info → Payment → Confirmation`.
  - `/reviews` — testimonials + contact form.
- **Static data:** `lib/data.ts` exports `property`, `gallery` (Unsplash CDN), `amenities` (icon-name strings mapped to `lucide-react` icons in `Amenities.tsx`), `testimonials`, `policies`.
- **Booking state:** `BookingFlow.tsx` keeps `checkIn`, `checkOut`, `guests`, `guestDetails`, `step` in component state. `useSearchParams` pre-fills from the home page widget. Booking reference generated client-side with `Math.random()`.
- **Calendar:** `BookingCalendar.tsx` uses `date-fns` and a hardcoded `MOCK_UNAVAILABLE` set; no `GET /api/availability` call is actually issued despite the README saying so.
- **Pricing:** `computeTotals` in `PricingSummary.tsx` — 5% service fee, 50% deposit, nights × `basePricePerNight`.
- **Payments:** `PaymentOptions.tsx` POSTs to `${NEXT_PUBLIC_API_BASE_URL}/api/payments/{mpesa/stripe/paypal}/…`. On error it falls back to a "connect backend" message.
- **Tokens:** `tailwind.config.ts` defines earth / gold / moss / lagoon / cream / ink palettes plus a custom `rounded-xl2` and two shadows. `app/globals.css` adds `.garden-path` divider, reveal animation, focus-visible outlines.
- **Images:** `next/image` with `images.unsplash.com` whitelisted in `next.config.js`.

### Backend (`bnb-backend`)
- **Stack declared in `package.json`:** Express 5, Prisma 7, Zod, Nodemailer, Axios, CORS, dotenv. `ts-node-dev` for dev.
- **Files that exist:** `package.json`, `tsconfig.json`, `prisma.config.ts`, `prisma/schema.prisma`, `.env` (placeholder Postgres URL).
- **Files that do NOT exist:** any source under `src/`, no `app.ts` / `server.ts`, no route handlers, no Zod schemas, no Prisma migrations, no `start` / `dev` scripts. `package.json` has only the default `test` placeholder.
- **Prisma schema:** empty datasource, **no models**.
- **README claim:** `POST /api/bookings`, `GET /api/availability`, `POST /api/payments/...`, `POST /api/contact`. None are implemented.

### Cross-cutting
- The two packages are siblings under one repo with **no `package.json` workspaces declaration** and **no top-level orchestration** (no Turborepo, no `concurrently`, no root `package.json`).
- `.env.example` lives in the frontend only; backend `.env` is a placeholder string.
- The frontend is intentionally demoable on its own, so all backend interactions fail gracefully — but the "graceful" path is the **only** path that actually exists.

---

## 2. Cons — what's wrong or risky

### 2.1 Architecture & repo structure
1. **Two-package repo with no workspace glue.** No root `package.json`, no `npm workspaces`, no `concurrently`, no shared `tsconfig`. A new contributor has to `cd` into each package and run separate `npm install` + `npm run dev` invocations.
2. **Backend is a shell.** `bnb-backend` has dependencies and a placeholder schema, but no application code. The README advertises six endpoints that simply do not exist.
3. **No `start` / `dev` script in backend.** `package.json` has only the default `test` placeholder. Cannot actually start the server.
4. **Prisma 7 with `prisma-client` generator + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`** is bleeding-edge. Generated client lives outside `node_modules` (`../generated/prisma`) and no code currently imports it.

### 2.2 Data model & persistence
5. **Empty Prisma schema.** No `Property`, `Room`, `Booking`, `Hold`, `Payment`, `ContactMessage`, `BlockedDate`, or `Guest` models. There is no durable place to store anything.
6. **Static content is hardcoded in the frontend.** `property`, `policies`, `gallery`, `testimonials`, `amenities` all live in `lib/data.ts`. The owner cannot update copy, prices, photos, or policies without a redeploy. There is no CMS or admin path.
7. **Currency and price live in code, not config.** A pricing change requires a redeploy and a frontend rebuild.
8. **Amenity icons resolved by string lookup in `Amenities.tsx`.** `iconMap` is a hard-coded `Record<string, LucideIcon>` with no fallback to a "missing" icon; new amenity entries silently render `Wifi` if the name is mistyped.

### 2.3 Booking flow correctness
9. **No 15-minute hold is actually placed.** `BookingFlow` advertises a hold to the user but only does so after the user clicks past step 1 — and there is no server call. A second guest can select the same dates with no contention.
10. **The "payment confirmed" path is not payment-confirmed.** M-Pesa STK push returns `success` after the *request* is sent, not after the user enters their PIN. `onPaid()` fires before the money moves. Stripe / PayPal redirect away but the success step is reached on the *response* from the create-order endpoint, not from a webhook or return URL.
11. **No double-booking protection.** There is no unique index, no transaction, no availability check at the booking endpoint.
12. **No minimum-stay / max-stay / check-in-day rules.** Property-specific rules (e.g. 2-night min, no same-day turnaround) are not enforced anywhere.
13. **Pricing is fully client-side.** Service fee, deposit, nights math, and currency formatting are computed in the browser. The backend is the only place this should be authoritative.
14. **Guest count is not bound to property capacity.** The input is `min=1 max=10`; the property is 3 ensuite rooms. There is no validation against real capacity.
15. **Email/phone validation is HTML-only.** `type="email"` and `type="tel"` provide UX hints but are not enforced. Empty strings, malformed values, and "asdf@asdf" all pass to the (nonexistent) backend.
16. **No idempotency key on booking creation.** A network retry from the client can create duplicate bookings.
17. **Booking reference generated client-side** with `Math.random().slice(2,8)` (6 chars, base36). Collisions are likely at modest scale, and references cannot be reconciled with backend records.

### 2.4 Payment integration
18. **M-Pesa flow does not handle the Daraja callback.** The frontend POSTs to `/api/payments/mpesa/stkpush`, but there is no `/api/payments/mpesa/callback` route, no `checkoutRequestId` polling, no timeout, and no reconciliation. A real integration requires both an STK push endpoint and a callback the Safaricom API hits asynchronously.
19. **No `idempotencyKey` for M-Pesa.** Daraja will reject duplicate requests only if the client supplies one. Current code does not.
20. **Stripe redirect is not verified.** `payWithStripe` redirects to `data.url` with no return-URL handler, no `session_id` lookup, and no signed webhook to mark the booking as paid. Returning guests could mark their own bookings paid.
21. **PayPal order is created but not captured.** `payWithPaypal` redirects to `approveUrl` but nothing in the codebase calls `/capture` or verifies the order status.
22. **Currency mismatch risk.** M-Pesa expects KES; Stripe test mode is configured per account; PayPal sandbox currency is account-specific. No currency negotiation happens.
23. **No error envelope contract.** Frontend just does `if (!res.ok) throw new Error("…")` — the user message is hardcoded in the catch block, not derived from the backend's actual error.

### 2.5 Security & privacy
24. **No server-side input validation.** There is no Zod schema (zod is installed but unused) on any of the advertised endpoints.
25. **Secrets in repo.** `bnb-backend/.env` is committed (well — present on disk; `.gitignore` excludes `.env` at the *root* only, not inside `bnb-backend/`). Worse, the value is a placeholder string that nonetheless proves the file is being persisted.
26. **`.gitignore` coverage gap.** The root `.gitignore` ignores `.env` and `.env.local` but not `bnb-backend/.env`. The backend package has its own `.gitignore` — confirm it covers the right things (it does list `.env`, but the file is already in the working tree).
27. **Contact form has no anti-spam, no rate limit, no captcha.** `ContactForm.tsx` only does `e.preventDefault()` + `setSent(true)`.
28. **CORS is not configured.** `cors` is in dependencies, but with no server, this is moot — when the server is built, the default of "*" is dangerous because cookies/auth are not in scope yet but might be added later.
29. **No request body size limit.** Express 5 does not enforce one by default.
30. **No logging / audit trail.** No `pino` / `winston`, no request id, no access log.
31. **PII is collected but not protected.** Guest name, email, phone are stored nowhere — fine for now, but the day a DB appears there is no encryption-at-rest story, no retention policy, and no DPA template.
32. **OpenStreetMap iframe is fine** but `bbox` and `marker` are interpolated without `encodeURIComponent`. Currently safe (all numeric), but the pattern invites bugs if non-numeric fields are added.

### 2.6 UX & accessibility
33. **No empty / loading / error states on the home page.** A slow network means blank gallery and blank testimonials.
34. **`<Image>` is used correctly** (`fill`, `sizes`, `priority` on hero) — good. But hero image is 1600px Unsplash without `placeholder="blur"`, so LCP has a flash.
35. **Stepper icons hide labels under `sm`.** Below 640px, the active step is just an icon — the user has to guess which step they are on.
36. **Print stylesheet missing.** The "Download receipt" button calls `window.print()` with no `@media print` rules, so the navbar/footer will print.
37. **No `prefers-reduced-motion` skip for the reveal animation** — it is wrapped in `no-preference`, which is correct, but the `.reveal` class is only on the hero copy; the same fade is desired on other entry elements and is not.
38. **Focus management on step change is absent.** Moving from step 1 to step 2 shifts the page but does not move focus to the new step's heading.
39. **Form errors are not announced.** `aria-invalid` and `aria-describedby` are not used; screen readers see "valid" until submission.
40. **Date format is `d MMM yyyy` everywhere** — fine, but the input `<input type="date">` shows the *browser's* locale format, which can differ (DD/MM/YYYY vs MM/DD/YYYY) from the rest of the UI.
41. **Confirmation page never tells the user the dates.** Step 4 says "Booking held" but doesn't echo check-in / check-out / guests. The only record is on the receipt they have to print.

### 2.7 Code quality
42. **Mixed module systems.** Frontend `package.json` has `"type": "commonjs"`, backend `tsconfig` uses `"module": "nodenext"` and `"verbatimModuleSyntax": true`. Easy to miscompile an import.
43. **`Amenities.tsx` `iconMap` lookup is `Record<string, LucideIcon>` with `?? Wifi` fallback** — a typo in `lib/data.ts` is invisible.
44. **`BookingFlow.tsx` is 178 lines and owns all four step renderers inline.** Hard to test, hard to extend.
45. **`useSearchParams` reads are unsanitized** — `new Date(params.get("checkIn")!)` is called with a non-null assertion; a malformed value produces an "Invalid Date" that silently propagates into the calendar.
46. **No ESLint config** is committed (only `next lint` script). No Prettier. Style will drift.
47. **No pre-commit / CI hooks.** No typecheck, no lint, no test gate.
48. **Duplicate input styles** are copy-pasted between `QuickAvailability`, `GuestForm`, `ContactForm`, and `BookingFlow`. Should be a shared `<Field>` / `<Input>` component.
49. **`paymentOptions.tsx` `mpesaPhone` initializes from the `phone` prop once** and never re-syncs. Editing phone on step 2 does not flow into step 3.

### 2.8 Testing & verification
50. **Zero tests.** No Jest, Vitest, Playwright. The backend has no test script. The frontend has no test script. There is no end-to-end happy path that can be run automatically.
51. **No typecheck script.** `tsc --noEmit` is not wired into either package.
52. **No smoke test of the readme contract.** A simple `curl` against the advertised endpoints would reveal the backend is missing.

### 2.9 Ops
53. **No Dockerfile, no `docker-compose.yml`.** Two services, no containerization, no one-command dev env.
54. **No `healthz` / `readyz` route** planned. Cannot be load-balanced.
55. **No deployment config.** No Vercel / Railway / Render / Fly / Nginx example. README has no deploy section.
56. **No CORS allow-list**, no env validation at boot (e.g. `zod` env schema).

---

## 3. Phased fix plan

Each phase lists **scope**, **deliverables**, **acceptance criteria**, and **out of scope**.

### Phase 0 — Foundations (1–2 days)
**Goal:** Make the repo buildable, runnable, and consistent in a single command.

Scope:
- Add root `package.json` with `npm workspaces` and a top-level `dev` script using `concurrently` (or `npm-run-all -p`).
- Add root `tsconfig.base.json`; let each package extend it.
- Add `.editorconfig`, `eslint.config.mjs` (flat config), `.prettierrc.json`, and a `lint` / `format` / `typecheck` script at the root.
- Move `.env.example` to repo root, plus a `bnb-backend/.env.example` with `DATABASE_URL`, `MPESA_*`, `STRIPE_*`, `PAYPAL_*`, `SMTP_*`.
- Update root `.gitignore` to also cover `bnb-backend/.env`, `bnb-backend/generated/`, `bnb-backend/dist/`.

Deliverables:
- `pnpm i` / `npm i` at the root installs both packages.
- `npm run dev` starts frontend + backend together with prefixed logs.
- `npm run typecheck` runs `tsc --noEmit` in both packages and exits 0.
- `npm run lint` exits 0.

Acceptance: a fresh clone boots both services in one command.

Out of scope: any new features.

---

### Phase 1 — Backend MVP (3–5 days)
**Goal:** Implement the six endpoints the frontend already expects, behind Zod-validated routes, against a real Prisma schema.

Scope:
- **Prisma models**: `Property`, `Room`, `BlockedDate`, `Booking` (status enum: `HELD`, `CONFIRMED`, `CANCELLED`, `EXPIRED`), `Payment` (provider enum: `MPESA`, `STRIPE`, `PAYPAL`, status enum: `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`), `ContactMessage`. Include `@@unique([propertyId, checkIn, checkOut])` constraints and indexes for date range queries.
- **Express app** with: structured logger (`pino`), request id middleware, JSON body limit (100 KB), CORS allow-list from env, `/healthz` and `/readyz`, `zod` env validation at boot.
- **Routes**:
  - `GET /api/availability?propertyId&month=YYYY-MM` → returns `Set<yyyy-MM-dd>` of unavailable dates.
  - `POST /api/bookings` → Zod-validated, transactional `createHold` (15-min expiry), returns `{ id, ref, expiresAt }`.
  - `POST /api/bookings/:id/confirm` (called by the payment-callback handlers).
  - `POST /api/payments/mpesa/stkpush` → proxies to Daraja sandbox with `idempotencyKey` = booking id.
  - `POST /api/payments/mpesa/callback` → Safaricom IPN handler; updates Payment + Booking.
  - `POST /api/payments/stripe/checkout-session` → server-side price recompute, returns `url`.
  - `POST /api/payments/stripe/webhook` → verifies signature, marks paid.
  - `POST /api/payments/paypal/create-order` and `/capture`.
  - `POST /api/contact` → validates with Zod, persists `ContactMessage`, sends email via Nodemailer.
- **Migrations**: one initial migration. Seed script for the single property, three rooms, blocked dates.
- **Tests**: supertest + Vitest covering happy path and one failure mode per route.

Acceptance:
- `curl -X POST localhost:4000/api/bookings -d '{...}'` returns a hold.
- `curl -X POST localhost:4000/api/availability?month=2026-08` returns the seeded blocked dates.
- M-Pesa sandbox STK push returns a `checkoutRequestId`.

Out of scope: production Daraja credentials, real Stripe/PayPal accounts.

---

### Phase 2 — Frontend → Backend wiring (2–3 days)
**Goal:** Replace every mock/fake with a real API call and a real loading / error state.

Scope:
- Add `lib/api.ts` (typed fetch wrapper that prefixes `NEXT_PUBLIC_API_BASE_URL`, throws on non-2xx with backend's `error.message`).
- `BookingCalendar` → fetch `/api/availability` for the visible month + ±1 month; show a skeleton while loading, an inline error with retry on failure.
- `BookingFlow`:
  - On step 1 → step 2, call `POST /api/bookings` and store `{ id, ref, expiresAt }`. Display a 15-min countdown.
  - On step 4, render the **server-issued `ref`** (not `Math.random`).
  - Echo check-in / check-out / guests / total on the confirmation card.
- `QuickAvailability` → no change in behavior, but the dates are parsed as `Date` (not `new Date(string)` blindly).
- `PaymentOptions`:
  - M-Pesa: stop calling `onPaid()` on response. Open a polling loop against `GET /api/bookings/:id/status` (or use SSE) until `paymentStatus === "SUCCEEDED"` or timeout.
  - Stripe: handle the return URL with `?session_id=...`; look up the booking.
  - PayPal: handle the return URL with `?token=...`; capture server-side.
- `ContactForm` → real `POST /api/contact` with `aria-live="polite"` error region.
- A `<Field>` / `<Input>` shared component to dedupe styles.

Acceptance:
- Stand the backend up, set `NEXT_PUBLIC_API_BASE_URL`, run the full booking flow end-to-end. The status of the booking in the DB transitions `HELD → CONFIRMED` after M-Pesa (simulated) succeeds.
- Killing the backend shows a clear "Could not reach server" with retry.

Out of scope: i18n, multi-property.

---

### Phase 3 — Booking flow correctness (2 days)
**Goal:** The server is the source of truth for pricing, capacity, and double-booking.

Scope:
- `Property` model gains `minStay`, `maxStay`, `turnaroundDays`, `basePrice`, `weekendSurcharge`, `currency`.
- `POST /api/bookings` runs inside a `prisma.$transaction` with `SERIALIZABLE` isolation. On conflict returns `409 Conflict` with a user-friendly message.
- Pricing service recomputes subtotal / fees / deposit from the server-side `basePrice`, not the request body. The request body's `amount` (if any) is ignored.
- Email + phone validated with Zod (E.164 for phone, RFC 5321-ish for email).
- Idempotency: `Idempotency-Key` header required on `POST /api/bookings`; server stores key → booking id for 24h.
- Booking reference: ULID (sortable) instead of `Math.random`.

Acceptance:
- Two parallel `POST /api/bookings` for the same dates → exactly one succeeds, the other gets 409.
- Submitting the same `Idempotency-Key` twice returns the original booking, not a duplicate.

Out of scope: dynamic pricing, seasonal rates, promo codes (deferred to a later phase).

---

### Phase 4 — Payments hardening (2–3 days)
**Goal:** Money movements are signed, idempotent, and reconciled.

Scope:
- M-Pesa:
  - Required env: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`.
  - Token cache with expiry.
  - `stkpush` includes `AccountReference` = booking ref.
  - `callback` verifies the encrypted credential, updates Payment + Booking, fires a confirmation email.
  - Reconciliation cron (or simple interval) to time out `PENDING` STK pushes after 2 minutes and expire their `HELD` bookings.
- Stripe:
  - Server-side `line_items` from the booking record; never trust client `amount`.
  - Webhook handler verifies `stripe-signature`; tolerates out-of-order events.
  - `success_url` includes `?session_id={CHECKOUT_SESSION_ID}` and `cancel_url` includes `?cancelled=1`.
- PayPal:
  - Server-side amount in the create-order call.
  - Capture after `onApproval` (not before).
- All payment routes return a uniform error shape: `{ error: { code, message } }` (the frontend already uses `data.checkoutRequestId` etc., so the type contract is published in `lib/api.ts`).

Acceptance:
- A simulated M-Pesa callback marks the booking paid and sends an email (MailHog in dev).
- A Stripe webhook test (using `stripe trigger`) flips a booking from `HELD` to `CONFIRMED`.

Out of scope: refunds, partial captures.

---

### Phase 5 — Security, privacy, accessibility, performance (2–3 days)
**Goal:** Ship-ready for a real-money demo.

Scope:
- **Security**
  - `helmet` middleware.
  - `express-rate-limit` on `/api/contact` and `/api/payments/*` (per IP, sliding window).
  - Body size limit (100 KB).
  - CORS allow-list from `WEB_ORIGIN` env.
  - Secrets: ensure no `.env` is committed; add `gitleaks` (or similar) pre-commit.
  - Add a `SECURITY.md` and a basic threat model in the README.
- **Privacy**
  - PII access logging: never log email / phone / notes at info level (logger redaction).
  - Contact form submissions and `notes` are stored encrypted-at-rest via column-level encryption (or, if too heavy, marked as "do not log").
  - Cookie-free design; no third-party analytics by default.
- **Accessibility**
  - All inputs get `id` + `<label htmlFor>` (already done — audit gaps).
  - `aria-invalid`, `aria-describedby` on form errors.
  - Focus management on booking step change (`step` heading gets `tabIndex={-1}` and is focused).
  - Stepper: keep labels visible at `sm`, or add a `<span class="sr-only">` so screen readers always read the step name.
  - Skip-to-content link.
  - Color contrast audit on gold-on-cream and cream-on-moss.
- **Performance**
  - Hero image: serve a `blur` placeholder (Unsplash supports `?blur=…&w=20`).
  - `Gallery` lazy-loads non-`priority` images.
  - Bundle audit: remove unused `lucide-react` icons via tree-shaking (already happens with named imports — verify with `@next/bundle-analyzer`).
  - Add `loading="lazy"` and `decoding="async"` to below-the-fold `<Image>` (Next 15 does this by default for non-priority; verify).
  - Add `<link rel="preconnect">` for `images.unsplash.com`.

Acceptance:
- Lighthouse a11y ≥ 95, perf ≥ 85 on `/` and `/booking`.
- `npm audit --omit=dev` shows no high/critical.

Out of scope: full WCAG AAA, multi-language support.

---

### Phase 6 — Testing, CI, demo (2–3 days)
**Goal:** The whole project can be re-verified on every push and the demo script is one command.

Scope:
- **Frontend tests**: Vitest + Testing Library for `BookingFlow`, `BookingCalendar`, `PricingSummary`, `ContactForm` happy-path + edge cases.
- **Backend tests**: supertest for each route; mocked Daraja / Stripe / PayPal adapters.
- **E2E**: Playwright happy path — open `/`, click "Check availability", pick dates, fill guest info, hit "Pay" (M-Pesa sim), land on confirmation.
- **CI** (`.github/workflows/ci.yml`): typecheck → lint → test → build → docker build (for backend).
- **Demo**: `scripts/demo.sh` — `docker compose up -d db backend`, `npm run seed`, `npm run dev`, prints URLs and test card / sandbox phone.
- **Docs**: a real `BACKEND_SETUP.md` that matches the code, plus a top-level `README.md` with deploy, env, and a "what works in sandbox" matrix.

Acceptance:
- `npm test` is green; CI badge in README is green.
- A fresh engineer can run the demo in under 5 minutes.

Out of scope: staging/prod deployment automation.

---

## 4. Summary table — con → phase → fix

| # | Con (short) | Phase |
|---|---|---|
| 1–4 | Repo / workspace / scripts / Prisma version pinning | 0 |
| 5–8 | Empty Prisma schema, static data, hardcoded prices/icons | 1, 2, 3 |
| 9–17 | No real hold, fake success, no idempotency, client-side pricing | 1, 2, 3 |
| 18–23 | M-Pesa callback missing, no Stripe verify, no PayPal capture | 1, 4 |
| 24–32 | No Zod, secrets in repo, no rate limit, no CORS, no logging | 1, 5 |
| 33–41 | A11y gaps, print stylesheet, focus management | 5 |
| 42–49 | Code quality — duplicated styles, mixed modules, unsanitized search params | 0, 2, 5 |
| 50–52 | Zero tests, no typecheck script | 6 |
| 53–56 | No Docker, no healthcheck, no deploy docs | 0, 6 |

---

## 5. Order of operations (one-screen view)

```
Phase 0  ─► Phase 1  ─► Phase 2  ─► Phase 3
            │             │             │
            └──► Phase 5 ◄┘             │
                                          ▼
                                       Phase 4
                                          │
                                          ▼
                                       Phase 6
```

Phases 0 → 1 → 2 → 3 are sequential. Phase 4 depends on 1 + 3. Phase 5 can start after Phase 2 and overlap. Phase 6 wraps everything.
