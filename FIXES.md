# Fixes — This Pass

Cross-references `DESIGN_REVIEW.md`'s numbered cons list (§2, items 1–56).
That document is the full audit; this file tracks what was requested and
actually changed in this pass, plus what's intentionally deferred.

Legend: ✅ done this pass · 📄 documented (design/setup written, implementation is follow-up work) · ⏭ deferred (tracked in DESIGN_REVIEW.md, out of scope here)

---

## ✅ Fixed this pass

### Booking page stuck on "Loading booking form..." (the reported bug)
Root cause was two-layered:

1. **Corrupted dependency.** `node_modules/date-fns` was missing every
   `.mjs` (ESM) build file — only the CommonJS `.js` files were present.
   Since `BookingCalendar.tsx` and `PricingSummary.tsx` import `date-fns` as
   ESM, webpack couldn't resolve it at all, `/booking` 500'd on every
   request, and the `<Suspense>` fallback ("Loading booking form...") is
   what a visitor sees frozen on screen when the child never successfully
   renders. Reinstalling `date-fns` properly resolved it — **run a clean
   `npm install` after unzipping this**, and if you ever see "Module not
   found" for a package that's clearly listed in `package.json`, delete
   `node_modules` and reinstall rather than assuming it's a code bug.
2. **Item #45 in DESIGN_REVIEW.md** — unsanitized `useSearchParams` reads.
   `new Date(params.get("checkIn")!)` produced an `Invalid Date` for any
   malformed/hand-edited URL, which would later throw inside a `date-fns`
   call during render. That throw had no error boundary to catch it, so —
   same visible symptom — the page would appear stuck rather than showing
   an error. Fixed in `lib/safeDate.ts` (validates `YYYY-MM-DD` shape and
   rejects anything that parses to `Invalid Date` or out-of-range guest
   counts) and wired into `BookingFlow.tsx`.

   Belt-and-suspenders: added `components/ErrorBoundary.tsx` around
   `BookingFlow` in `app/booking/page.tsx`, so any *future* render error in
   the booking flow shows a "Try again" card instead of leaving the
   Suspense fallback showing forever.

### Item #42 — Mixed module systems
Frontend `package.json` said `"type": "commonjs"` while the code is 100%
ESM (`import`/`export` everywhere) and the backend's `tsconfig` already
assumed `nodenext`/ESM. This actually broke tooling: Next was warning it
couldn't load `tailwind.config.ts` as an ES module because `type: module`
wasn't set. Fixed:
- `package.json` (frontend) → `"type": "module"`.
- `bnb-backend/package.json` → `"type": "module"` (matches its
  `verbatimModuleSyntax`/`nodenext` tsconfig).
- `next.config.js` and `postcss.config.js` converted from
  `module.exports = …` to `export default …` to match.
- Verified with a clean `npm run build`-equivalent (`tsc --noEmit` — see
  note below) and `next dev` smoke tests of `/`, `/booking`, `/property`,
  `/reviews` — all 200, tailwind-config warning gone.

### Item #48 (partial) — Duplicate styles
The exact class string
`"bg-white rounded-xl2 shadow-card border border-earth/10"` was
copy-pasted across `BookingCalendar`, `BookingFlow`, `ContactForm`,
`GuestForm`, `PaymentOptions`, `PricingSummary`, `Amenities`, and
`Testimonials`. Consolidated into a single `.card` utility in
`app/globals.css` (with a dark-mode variant baked in), and every component
above now just uses `className="card ..."`. One place to change the card
look going forward, and it's automatically dark-mode aware. (The
`<Field>`/`<Input>` component consolidation the design review also
suggests for form inputs is not done here — flagged as ⏭ below.)

### Dark / light mode toggle
- `components/ThemeProvider.tsx` — context + `localStorage` persistence,
  respects OS `prefers-color-scheme` on first visit.
- An inline script in `app/layout.tsx` (`ThemeInitScript`) sets the `dark`
  class on `<html>` *before* hydration, so there's no flash of the wrong
  theme.
- `components/ThemeToggle.tsx` — sun/moon icon button, wired into
  `Navbar.tsx` (desktop and mobile).
- `tailwind.config.ts` → `darkMode: "class"`.
- `dark:` variants added to `globals.css` (body/background), `Navbar`,
  the homepage's prose text, and the new shared `.card` class. This covers
  the primary surfaces; a few deeper components (e.g. `PaymentOptions`
  provider icons) may want additional `dark:` polish as you go —
  straightforward to extend since the pattern is now established.

### AOS (Animate On Scroll)
- Added `aos` + `@types/aos` to `package.json`.
- `components/AOSInit.tsx` — client component that calls `AOS.init()` on
  mount, respects `prefers-reduced-motion`, `once: true` so animations
  don't re-trigger on every scroll-past.
- Mounted once in `app/layout.tsx`.
- `data-aos` attributes added to the homepage's section reveals (about,
  gallery, amenities, find-us, testimonials, CTA) with a couple of
  staggered delays. The existing hand-rolled `.reveal` CSS animation
  (item #37 in the review) is untouched — AOS is additive, used for
  scroll-triggered reveals further down the page.

---

## 📄 Documented (design written, implementation is a follow-up)

- **`SUPABASE_ARCHITECTURE.md`** — full switch plan from the currently-empty
  `bnb-backend` (Prisma, no models) to Supabase: schema, RLS policies, a
  guest-data-safe availability view, code architecture
  (`lib/supabase/{client,server,admin}.ts`), and where Edge Functions plug
  into the existing `PaymentOptions.tsx` flow. This directly addresses
  DESIGN_REVIEW items #1, #2, #5, #11, #13, #24 by giving a concrete target
  architecture — the migration itself (running it) is the next step.
- **`PAYMENT_SANDBOX_SETUP.md`** — M-Pesa Daraja sandbox, Stripe test mode,
  PayPal sandbox: where to get credentials, test phone numbers/cards, and a
  testing checklist. Complements DESIGN_REVIEW §2.4 (items #18–23).

---

## ⏭ Deferred (already tracked in `DESIGN_REVIEW.md`, not touched here)

Everything else in the review's Phase 1–6 plan is still open — most
notably: no actual booking hold/double-booking protection (#9, #11), no
server-side pricing authority (#13), no payment webhook verification (#18,
#20, #21) beyond the architecture doc above, no tests (#50–52), no CI/CD or
Docker (#53–56), no shared `<Field>` component for form inputs (#48,
remainder). Treat `DESIGN_REVIEW.md`'s phased plan as the source of truth
for sequencing that work.

---

## Verification performed

- `npx tsc --noEmit` — clean.
- `next dev` smoke test of `/`, `/booking` (with and without query params),
  `/property`, `/reviews` — all `200`.
- Manually reproduced the booking-page 500 before the fix and confirmed it
  cleared after reinstalling `date-fns` and applying the safe-parsing fix.
- `next build` could not be fully verified in this sandbox because outbound
  access to `fonts.googleapis.com` (used by `next/font/google`) is
  network-restricted here — that's a sandbox limitation, not a code issue;
  it will fetch normally wherever this runs with normal internet access.
  Everything else in the build pipeline (typecheck, module resolution,
  Tailwind/PostCSS config loading) was verified directly.
