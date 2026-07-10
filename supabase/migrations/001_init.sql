-- ========================================================
-- 1. BASE TABLES (Original Schema with Safety Cascades)
-- ========================================================

create table ifnot exists public.bookings (
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

create table ifnot exists public.payments (
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

create table ifnot exists public.blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  reason      text,
  created_at  timestamptz not null default now()
);

create table ifnot exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Index for faster date availability lookups
create index ifnot exists bookings_date_range_idx on public.bookings (check_in, check_out);


-- ========================================================
-- 2. AUTOMATION: AUTOMATIC STATUS SYNC TRIGGER
-- ========================================================

-- Clean up older definitions if they exist to prevent conflicts
drop trigger if exists on_payment_success on public.payments;
drop function if exists public.handle_payment_success();

-- Create the trigger function that bridges payments and bookings
create or replace function public.handle_payment_success()
returns trigger as $$
begin
  -- Check if the payment status has just transitioned into 'succeeded'
  if new.status = 'succeeded' and (old.status isnull or old.status <> 'succeeded') then
    
    update public.bookings
    set status = 'confirmed'
    where id = new.booking_id;
    
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Attach the trigger to activate immediately on updates to payments
create trigger on_payment_success
  after update on public.payments
  for each row
  execute function public.handle_payment_success();