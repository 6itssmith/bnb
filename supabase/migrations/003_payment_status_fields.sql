-- Payment status fields used by the guest site and CMS.
--
-- `bookings.status` remains the lifecycle status (pending_payment,
-- confirmed, cancelled, completed). These fields make the payment outcome
-- explicit for CMS reporting and preserve the provider transaction reference.

alter table public.bookings
  add column if not exists payment_status text not null default 'Pending'
    check (payment_status in ('Pending', 'Success', 'Failed')),
  add column if not exists transaction_id text;

alter table public.payments
  add column if not exists transaction_id text;

-- The original schema stored lower-case provider keys. Keep that internal
-- convention in payments.provider, while the booking-facing CMS value uses
-- the requested display labels.
alter table public.bookings
  drop constraint if exists bookings_payment_method_check;

update public.bookings
set payment_method = case payment_method
  when 'mpesa' then 'M-Pesa'
  when 'stripe' then 'Stripe'
  when 'paypal' then 'PayPal'
  else payment_method
end
where payment_method in ('mpesa', 'stripe', 'paypal');

alter table public.bookings
  add constraint bookings_payment_method_check
  check (payment_method in ('M-Pesa', 'Stripe', 'PayPal'));

update public.bookings
set payment_status = case
  when status in ('confirmed', 'completed') then 'Success'
  when status = 'cancelled' then 'Failed'
  else 'Pending'
end
where payment_status = 'Pending';

create unique index if not exists payments_transaction_id_unique
  on public.payments (transaction_id)
  where transaction_id is not null;
