-- 002_cms.sql
-- CMS additions: staff accounts & roles, property content, calendar price
-- overrides, housekeeping, reviews, and an audit log. Purely additive —
-- doesn't alter anything from 001_init.sql. Run this against the SAME
-- Supabase project the guest site already uses; the CMS has no database
-- of its own.

create extension if not exists pgcrypto;

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

create table public.staff_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        text not null default 'staff' check (role in ('super_admin','manager','staff')),
  status      text not null default 'pending' check (status in ('pending','active','suspended')),
  created_at  timestamptz not null default now()
);

create table public.property_content (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  tagline               text,
  location              text,
  description           text,
  support_email         text,
  support_phone         text,
  base_price_per_night  numeric(10,2) not null default 0,
  currency              text not null default 'KES',
  gallery               jsonb not null default '[]',
  amenities             jsonb not null default '[]',
  policies              jsonb not null default '[]',
  updated_by            uuid references public.staff_profiles(id),
  updated_at            timestamptz not null default now()
);

create table public.date_price_overrides (
  date   date primary key,
  price  numeric(10,2) not null check (price > 0)
);

create table public.housekeeping_tasks (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid references public.bookings(id) on delete set null,
  title        text not null,
  due_date     date,
  status       text not null default 'suggested' check (status in ('suggested','assigned','done')),
  assigned_to  uuid references public.staff_profiles(id),
  source       text not null default 'manual' check (source in ('auto','manual')),
  created_at   timestamptz not null default now()
);

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid references public.bookings(id) on delete set null,
  guest_name   text not null,
  stay_label   text,
  quote        text not null,
  rating       smallint check (rating between 1 and 5),
  status       text not null default 'pending' check (status in ('pending','approved','hidden')),
  reply        text,
  replied_by   uuid references public.staff_profiles(id),
  created_at   timestamptz not null default now()
);

create table public.staff_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.staff_profiles(id),
  action        text not null,
  target_table  text,
  target_id     text,
  details       jsonb,
  created_at    timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Helper function
--
-- RLS policies on staff_profiles can't query staff_profiles inside their own
-- USING clause without recursing, so every other policy that needs "is this
-- caller an active staff member, and what role" goes through this instead.
-- SECURITY DEFINER + a pinned search_path so it can't be hijacked by a
-- session-local search_path change.
------------------------------------------------------------------------------

create or replace function public.current_staff_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.staff_profiles
  where id = auth.uid() and status = 'active'
  limit 1;
$$;

grant execute on function public.current_staff_role() to authenticated;

------------------------------------------------------------------------------
-- Auto-suggested housekeeping task on booking confirmation
--
-- Fires once, the moment a booking's status flips to 'confirmed' (from the
-- payment webhook/capture functions, using the service-role key, which
-- bypasses RLS same as this trigger's SECURITY DEFINER does). It's a
-- reference/suggestion only — staff still assign, edit, or delete it.
------------------------------------------------------------------------------

create or replace function public.suggest_housekeeping_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    insert into public.housekeeping_tasks (booking_id, title, due_date, status, source)
    values (
      new.id,
      'Clean after checkout — ' || new.guest_name,
      new.check_out,
      'suggested',
      'auto'
    );
  end if;
  return new;
end;
$$;

create trigger bookings_suggest_housekeeping
  after update on public.bookings
  for each row
  execute function public.suggest_housekeeping_task();

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

alter table public.staff_profiles       enable row level security;
alter table public.property_content     enable row level security;
alter table public.date_price_overrides enable row level security;
alter table public.housekeeping_tasks   enable row level security;
alter table public.reviews              enable row level security;
alter table public.staff_audit_log      enable row level security;

-- staff_profiles --------------------------------------------------------

-- Signup creates exactly one row for yourself, always pending/staff — you
-- cannot insert yourself in as active or as a higher role.
create policy "user can create own pending profile"
  on public.staff_profiles for insert
  to authenticated
  with check (id = auth.uid() and status = 'pending' and role = 'staff');

-- Any active staff member can read the staff list (needed for "assign to"
-- pickers); a pending/suspended user can still read their OWN row so the
-- pending-approval / suspended screens work.
create policy "staff can read staff list"
  on public.staff_profiles for select
  to authenticated
  using (public.current_staff_role() is not null or id = auth.uid());

create policy "super_admin manages staff profiles"
  on public.staff_profiles for update
  to authenticated
  using (public.current_staff_role() = 'super_admin')
  with check (true);

create policy "service role manages staff profiles"
  on public.staff_profiles for all
  to service_role
  using (true) with check (true);

-- property_content --------------------------------------------------------

create policy "anyone can read property content"
  on public.property_content for select
  to anon, authenticated
  using (true);

create policy "manager+ can write property content"
  on public.property_content for all
  to authenticated
  using (public.current_staff_role() in ('manager','super_admin'))
  with check (public.current_staff_role() in ('manager','super_admin'));

-- date_price_overrides --------------------------------------------------------

create policy "anyone can read price overrides"
  on public.date_price_overrides for select
  to anon, authenticated
  using (true);

create policy "manager+ can write price overrides"
  on public.date_price_overrides for all
  to authenticated
  using (public.current_staff_role() in ('manager','super_admin'))
  with check (public.current_staff_role() in ('manager','super_admin'));

-- housekeeping_tasks --------------------------------------------------------

create policy "active staff can read housekeeping tasks"
  on public.housekeeping_tasks for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "manager+ can create housekeeping tasks"
  on public.housekeeping_tasks for insert
  to authenticated
  with check (public.current_staff_role() in ('manager','super_admin'));

create policy "manager+ can delete housekeeping tasks"
  on public.housekeeping_tasks for delete
  to authenticated
  using (public.current_staff_role() in ('manager','super_admin'));

-- Staff can update tasks assigned to them (e.g. mark done); manager+ can
-- update any task (reassign, edit, etc).
create policy "staff update own tasks, manager+ any"
  on public.housekeeping_tasks for update
  to authenticated
  using (public.current_staff_role() in ('manager','super_admin') or assigned_to = auth.uid())
  with check (public.current_staff_role() in ('manager','super_admin') or assigned_to = auth.uid());

create policy "service role manages housekeeping tasks"
  on public.housekeeping_tasks for all
  to service_role
  using (true) with check (true);

-- reviews --------------------------------------------------------

-- Guests can submit a review directly (mirrors the contact_messages
-- pattern in 001_init.sql) — always starts pending, never self-approved.
create policy "anyone can submit a review"
  on public.reviews for insert
  to anon
  with check (status = 'pending' and reply is null and replied_by is null);

create policy "approved reviews are public"
  on public.reviews for select
  to anon
  using (status = 'approved');

create policy "active staff can read all reviews"
  on public.reviews for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "active staff can respond/moderate reviews"
  on public.reviews for update
  to authenticated
  using (public.current_staff_role() is not null)
  with check (public.current_staff_role() is not null);

-- staff_audit_log --------------------------------------------------------

create policy "super_admin can read audit log"
  on public.staff_audit_log for select
  to authenticated
  using (public.current_staff_role() = 'super_admin');

create policy "active staff can write audit log entries"
  on public.staff_audit_log for insert
  to authenticated
  with check (public.current_staff_role() is not null);

create policy "service role manages audit log"
  on public.staff_audit_log for all
  to service_role
  using (true) with check (true);

------------------------------------------------------------------------------
-- Staff access to the guest-facing tables created in 001_init.sql
-- (these ADD to the existing policies there — Postgres OR's multiple
-- permissive policies together, nothing here removes what already exists)
------------------------------------------------------------------------------

create policy "active staff can read bookings"
  on public.bookings for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "manager+ can update bookings"
  on public.bookings for update
  to authenticated
  using (public.current_staff_role() in ('manager','super_admin'))
  with check (public.current_staff_role() in ('manager','super_admin'));

create policy "manager+ can manage blocked dates"
  on public.blocked_dates for all
  to authenticated
  using (public.current_staff_role() in ('manager','super_admin'))
  with check (public.current_staff_role() in ('manager','super_admin'));

create policy "active staff can read payments"
  on public.payments for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "active staff can read contact messages"
  on public.contact_messages for select
  to authenticated
  using (public.current_staff_role() is not null);