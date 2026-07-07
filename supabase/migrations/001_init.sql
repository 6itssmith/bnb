-- 001_init.sql
-- Initial schema for the Ridgeview Cottage B&B.
-- Run via: npx supabase db push
--
-- This file creates the four transactional tables, the guest-data-safe
-- availability view the calendar reads from, indexes, and all Row Level
-- Security policies. Without the policies, the tables exist but the anon
-- role (the only role the browser can assume) can neither write a booking
-- nor read availability, and the Edge Functions can't manage payments.

-- gen_random_uuid() lives in pgcrypto; enable it explicitly so the project
-- works on Supabase instances where it isn't pre-installed.
create extension if not exists pgcrypto;

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

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

-- Index used by the booked_ranges view and any future date-overlap queries.
create index bookings_date_range_idx on public.bookings (check_in, check_out);

------------------------------------------------------------------------------
-- Availability view (exposes dates only, never guest PII)
------------------------------------------------------------------------------

create view public.booked_ranges as
  select check_in, check_out
  from public.bookings
  where status in ('pending_payment', 'confirmed');

-- The anon role needs SELECT on the view to render the calendar. The
-- underlying bookings table remains locked down by RLS below.
grant select on public.booked_ranges to anon;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

alter table public.bookings         enable row level security;
alter table public.payments         enable row level security;
alter table public.blocked_dates    enable row level security;
alter table public.contact_messages enable row level security;

-- Public (anon) can INSERT a booking (create a booking request) but cannot
-- read other guests' bookings or update/delete anything.
create policy "anyone can create a booking"
  on public.bookings for insert
  to anon
  with check (true);

-- Public cannot read the raw bookings table — availability is exposed via
-- the booked_ranges view above, which only exposes dates.
create policy "no public select on bookings table"
  on public.bookings for select
  to anon
  using (false);

-- The service role (used server-side / inside Edge Functions) fully manages
-- payments. The browser never holds the service-role key.
create policy "service role manages payments"
  on public.payments for all
  to service_role
  using (true) with check (true);

-- Bookings status transitions are service-role only — confirmed/pending/cancelled
-- flips happen from the payment webhook handlers, never from the browser.
create policy "service role manages bookings"
  on public.bookings for update
  to service_role
  using (true) with check (true);

create policy "service role can read bookings"
  on public.bookings for select
  to service_role
  using (true);

-- blocked_dates is world-readable so the calendar can grey out owner-held dates.
create policy "public can read blocked dates"
  on public.blocked_dates for select
  to anon
  using (true);

create policy "service role manages blocked dates"
  on public.blocked_dates for all
  to service_role
  using (true) with check (true);

-- Contact form: anyone can submit, no one can read back (the owner reads
-- from the Supabase dashboard, not the API).
create policy "anyone can send a contact message"
  on public.contact_messages for insert
  to anon
  with check (true);

create policy "no public select on contact messages"
  on public.contact_messages for select
  to anon
  using (false);

create policy "service role can read contact messages"
  on public.contact_messages for select
  to service_role
  using (true);
