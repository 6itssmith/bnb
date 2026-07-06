# Switching to Supabase — Architecture Guide

This replaces the currently-empty `bnb-backend` (Express-shaped, Prisma + raw
Postgres) with **Supabase**: hosted Postgres, Auth, Storage, and Edge
Functions. The goal is one managed backend instead of a server you deploy and
patch yourself.

---

## 1. Why switch

| Concern | Prisma + custom Express backend | Supabase |
|---|---|---|
| Hosting | You provision & patch a Node server | Managed, nothing to run |
| Auth | Build it yourself (sessions, hashing, resets) | Built-in (email/password, magic link, OAuth) |
| DB access from frontend | Must go through your API for every query | `supabase-js` can query Postgres directly, guarded by Row Level Security (RLS) |
| Realtime (e.g. "this date just got booked") | Custom websockets | Built-in Realtime channels on table changes |
| File storage (ID uploads, property photos) | Custom S3 wiring | Built-in Storage buckets with policies |
| Payment webhooks | Custom Express route | Edge Function (Deno), same repo, deployed with `supabase functions deploy` |

Given `bnb-backend/prisma/schema.prisma` has no models yet, there's no data
to migrate — this is a clean cutover, not a live migration.

---

## 2. High-level architecture

```
┌─────────────────────────┐
│   Next.js App Router     │  (this repo, root)
│  ┌────────────────────┐  │
│  │ Server Components   │──┼──►  supabase-js (service role, server-only)
│  │ Client Components   │──┼──►  supabase-js (anon key, RLS-enforced)
│  └────────────────────┘  │
└───────────┬──────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│              Supabase project             │
│  ┌───────────┐ ┌────────┐ ┌────────────┐ │
│  │ Postgres  │ │  Auth  │ │  Storage   │ │
│  │ + RLS     │ │        │ │ (photos)   │ │
│  └───────────┘ └────────┘ └────────────┘ │
│  ┌───────────────────────────────────┐   │
│  │ Edge Functions (Deno)              │   │
│  │  - mpesa-webhook                   │   │
│  │  - stripe-webhook                  │   │
│  │  - paypal-webhook                  │   │
│  │  - create-payment-intent           │   │
│  └───────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

`bnb-backend` (Express/Prisma) is retired. Anything that previously needed a
"trusted server" (creating payment intents, verifying webhook signatures)
moves into Supabase Edge Functions, which live in `supabase/functions/*` in
this same repo.

---

## 3. Database schema

Run as a migration in `supabase/migrations/0001_init.sql`:

```sql
-- Guests never need their own login for a single-property B&B; we key
-- bookings off contact details captured in GuestForm, plus an optional
-- link to an authenticated user for the admin/owner dashboard.
create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  check_in        date not null,
  check_out       date not null,
  guests          smallint not null check (guests between 1 and 10),
  guest_name      text not null,
  guest_email     text not null,
  guest_phone     text,
  nightly_rate    numeric(10,2) not null,
  total_amount    numeric(10,2) not null,
  currency        text not null default 'KES',
  deposit_amount  numeric(10,2) not null,
  status          text not null default 'pending_payment'
                  check (status in ('pending_payment','confirmed','cancelled','completed')),
  payment_method  text check (payment_method in ('mpesa','stripe','paypal')),
  created_at      timestamptz not null default now(),
  constraint check_out_after_check_in check (check_out > check_in)
);

-- One row per payment attempt/confirmation, so a booking can be retried
-- across providers without losing the audit trail.
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  provider          text not null check (provider in ('mpesa','stripe','paypal')),
  provider_ref      text,            -- Daraja CheckoutRequestID / Stripe PaymentIntent id / PayPal order id
  amount            numeric(10,2) not null,
  currency          text not null default 'KES',
  status            text not null default 'initiated'
                     check (status in ('initiated','succeeded','failed')),
  raw_payload       jsonb,           -- webhook body, for debugging/reconciliation
  created_at        timestamptz not null default now()
);

-- Blocks out dates the owner takes offline manually (maintenance, personal use)
-- in addition to dates implied by confirmed bookings.
create table public.blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  reason      text,
  created_at  timestamptz not null default now()
);

-- Contact form submissions from the Reviews & Contact page.
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

create index bookings_date_range_idx on public.bookings (check_in, check_out);
```

### Row Level Security

```sql
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.contact_messages enable row level security;

-- Public (anon) can INSERT a booking (create a booking request) but cannot
-- read other guests' bookings or update/delete anything.
create policy "anyone can create a booking"
  on public.bookings for insert
  to anon
  with check (true);

-- Public can read only enough to render the calendar (check_in/check_out),
-- not guest PII. Do this via a view, not the raw table (see §4).
create policy "no public select on bookings table"
  on public.bookings for select
  to anon
  using (false);

-- Only the service role (used server-side / in Edge Functions) manages
-- payments and status transitions.
create policy "service role manages payments"
  on public.payments for all
  to service_role
  using (true) with check (true);

create policy "public can read blocked dates"
  on public.blocked_dates for select
  to anon
  using (true);

create policy "anyone can send a contact message"
  on public.contact_messages for insert
  to anon
  with check (true);
```

### 4. Availability without leaking guest data

Expose a view instead of the raw `bookings` table for the calendar:

```sql
create view public.booked_ranges as
  select check_in, check_out
  from public.bookings
  where status in ('pending_payment', 'confirmed');

grant select on public.booked_ranges to anon;
```

`BookingCalendar.tsx` queries `booked_ranges` (and `blocked_dates`) to grey
out unavailable dates — guest names, emails, and totals never reach the
browser for other people's bookings.

---

## 5. Code architecture in this repo

```
lib/
  supabase/
    client.ts       # browser client, anon key — for Client Components
    server.ts        # server client, uses cookies for session — for Server Components
    admin.ts         # service-role client — Route Handlers / Edge Functions ONLY, never imported client-side
supabase/
  migrations/
    0001_init.sql
  functions/
    create-payment-intent/index.ts
    mpesa-webhook/index.ts
    stripe-webhook/index.ts
    paypal-webhook/index.ts
  config.toml
```

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`lib/supabase/server.ts` (Server Components / Route Handlers, reads cookies
for an authenticated owner/admin session):

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}
```

`lib/supabase/admin.ts` (service role — **never** bundled into client code;
only used inside Route Handlers/Edge Functions that run server-side):

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

### Where each piece plugs in

- `BookingCalendar.tsx` → `lib/supabase/client.ts` → reads `booked_ranges` +
  `blocked_dates` to grey out taken dates.
- `GuestForm.tsx` submit → inserts a row into `bookings` (status
  `pending_payment`) via the anon client (allowed by the insert policy
  above).
- `PaymentOptions.tsx` → calls a Next.js Route Handler
  (`app/api/create-payment/route.ts`), which uses `lib/supabase/admin.ts` to
  read the booking and call the relevant Supabase Edge Function
  (`create-payment-intent`) to talk to Daraja/Stripe/PayPal with secret keys
  that never reach the browser.
- Provider webhooks hit the Edge Functions directly
  (`https://<project>.functions.supabase.co/stripe-webhook`, etc.), which
  verify the signature, then update `payments` and `bookings.status` using
  the service role.

---

## 6. Environment variables

```
# Public — safe in the browser bundle
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Server-only — never prefix with NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Set these in `.env.local` for the frontend, and as Supabase project secrets
(`supabase secrets set ...`) for Edge Functions — the two are separate
stores.

---

## 7. Migration steps (practical order)

1. `npx supabase init` at the repo root; `npx supabase login`; `npx supabase link --project-ref <ref>`.
2. Add `0001_init.sql` above under `supabase/migrations/`, then
   `npx supabase db push`.
3. `npm install @supabase/supabase-js @supabase/ssr` in the frontend.
4. Add `lib/supabase/client.ts`, `server.ts`, `admin.ts` as above.
5. Wire `BookingCalendar` and `GuestForm` to Supabase (replace any
   mocked/local data in `lib/data.ts` that represents bookings —
   `property`, `gallery`, `amenities`, `testimonials`, `policies` can stay
   as static content since they aren't transactional data).
6. Write the Edge Functions in `supabase/functions/`, deploy with
   `npx supabase functions deploy <name>`.
7. Point payment provider dashboards (Daraja, Stripe, PayPal) at the deployed
   function URLs as their webhook endpoints.
8. Delete `bnb-backend/` once the above is live (kept until then as a
   reference for anyone who already started modeling data there).

See `PAYMENT_SANDBOX_SETUP.md` for provider-specific sandbox credentials and
testing.
