# Payment Sandbox Setup

`PaymentOptions.tsx` offers three methods: **M-Pesa**, **Stripe** (card), and
**PayPal**. Here's how to get sandbox credentials for each so you can test
the full booking → payment flow before going live. Pair this with
`SUPABASE_ARCHITECTURE.md` §5 for where each key is used in code.

---

## 1. M-Pesa (Safaricom Daraja API)

M-Pesa is the primary path for Kenyan guests, via STK Push (the "enter PIN"
prompt on the guest's phone).

1. Create an account at **https://developer.safaricom.co.ke**.
2. Create a new app in the developer portal. This gives you a sandbox
   **Consumer Key** and **Consumer Secret**.
3. The sandbox provides a shared test shortcode (`174379`) and a published
   test **Passkey** — both are in Safaricom's Daraja documentation under
   "Lipa na M-Pesa Online Sandbox".
4. Sandbox STK Push only works with Safaricom's test MSISDN
   (`254708374149`) — real phone numbers won't receive a prompt in sandbox
   mode.
5. Environment variables:

   ```
   MPESA_ENV=sandbox
   MPESA_CONSUMER_KEY=<from portal>
   MPESA_CONSUMER_SECRET=<from portal>
   MPESA_SHORTCODE=174379
   MPESA_PASSKEY=<sandbox passkey>
   MPESA_CALLBACK_URL=https://<project-ref>.functions.supabase.co/mpesa-webhook
   ```

6. Flow: Route Handler requests an OAuth token from
   `https://sandbox.safaricom.co.ke/oauth/v1/generate`, then calls
   `/mpesa/stkpush/v1/processrequest` with the amount and callback URL.
   Safaricom later POSTs the result to `MPESA_CALLBACK_URL` — that's the
   `mpesa-webhook` Edge Function, which updates `payments` and `bookings`.
7. Going live later just means swapping `MPESA_ENV=production`, a
   production shortcode/passkey issued after Safaricom's go-live review, and
   the production base URL (`api.safaricom.co.ke`).

---

## 2. Stripe (cards)

1. Create a free account at **https://dashboard.stripe.com/register**.
2. Stripe accounts start in **test mode** automatically — no separate
   sandbox signup needed. Toggle "Test mode" in the dashboard to confirm.
3. Grab the test keys from **Developers → API keys**:

   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

4. For local webhook testing, install the Stripe CLI and run:

   ```
   stripe listen --forward-to localhost:3000/api/stripe-webhook
   ```

   This prints a `whsec_...` value — set it as `STRIPE_WEBHOOK_SECRET`. In
   production, add the deployed Edge Function URL as a webhook endpoint in
   the dashboard instead, and use the signing secret it generates.
5. Test card numbers (any future expiry, any CVC):

   | Scenario | Card number |
   |---|---|
   | Success | `4242 4242 4242 4242` |
   | Requires 3D Secure | `4000 0025 0000 3155` |
   | Declined | `4000 0000 0000 9995` |

6. Flow: Route Handler creates a PaymentIntent (or Checkout Session) with
   `STRIPE_SECRET_KEY` server-side, returns the `client_secret` to
   `PaymentOptions.tsx`, which confirms it with Stripe.js using the
   publishable key. The `stripe-webhook` Edge Function verifies the event
   signature and marks the booking `confirmed`.

---

## 3. PayPal

1. Create a developer account at **https://developer.paypal.com**.
2. Under **Apps & Credentials**, make sure you're viewing **Sandbox**
   (toggle at the top), then **Create App**. This gives a sandbox
   **Client ID** and **Secret**.
3. Under **Sandbox → Accounts**, PayPal auto-generates a test personal
   (buyer) and business (seller) account with fake balances — use the
   personal account's email/password to log in and approve payments during
   testing.
4. Environment variables:

   ```
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=<sandbox client id>
   PAYPAL_CLIENT_SECRET=<sandbox secret>
   ```

5. Flow: Route Handler calls PayPal's Orders API
   (`https://api-m.sandbox.paypal.com/v2/checkout/orders`) to create an
   order, guest approves it via the PayPal button/redirect, then a capture
   call confirms funds. PayPal sends webhook events to the `paypal-webhook`
   Edge Function to reconcile asynchronously.

---

## 4. Local `.env.local` template

```
# M-Pesa
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=174379
MPESA_PASSKEY=
MPESA_CALLBACK_URL=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# PayPal
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

# Supabase (see SUPABASE_ARCHITECTURE.md)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never commit real (non-sandbox) secrets. `.env.local` is already
git-ignored by Next.js's default `.gitignore`.

---

## 5. Testing checklist

- [ ] Book a stay with the M-Pesa sandbox MSISDN and confirm the webhook
      flips the booking to `confirmed`.
- [ ] Book with Stripe test card `4242 4242 4242 4242`, confirm success.
- [ ] Book with Stripe test card `4000 0000 0000 9995`, confirm the booking
      stays `pending_payment` and the guest sees a decline message.
- [ ] Book with a PayPal sandbox buyer account, confirm capture updates the
      booking.
- [ ] Confirm `payments.raw_payload` captures the webhook body for every
      provider, for reconciliation if something looks off later.
