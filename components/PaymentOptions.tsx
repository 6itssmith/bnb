"use client";

import { useEffect, useState } from "react";
import {
  Smartphone,
  CreditCard,
  Wallet,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabase/functions";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  simulateMpesaStk,
  simulateStripeCheckout,
  simulatePaypalOrder,
  type PaymentResult,
} from "@/lib/paymentSimulator";

type Method = "mpesa" | "stripe" | "paypal";
type Status = "idle" | "processing" | "success" | "error";

export type PaymentSuccess = {
  provider: Method;
  providerRef: string;
  transactionId: string;
  smsPhone: string;
  simulated: boolean;
};

type Props = {
  amountKES: number;
  phone: string;
  bookingId: string;
  onPaid: (result: PaymentSuccess) => void;
};

type EdgeFunctionResponse = {
  providerRef: string;
  url?: string;
  approveUrl?: string;
};

function isBackendNotConfigured(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("NEXT_PUBLIC_SUPABASE_URL is not set") ||
      err.message.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"))
  );
}

export default function PaymentOptions({ amountKES, phone, bookingId, onPaid }: Props) {
  const [method, setMethod] = useState<Method>("mpesa");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // M-Pesa phone persists across reloads (and re-syncs if the guest details
  // step's phone number changes) — fixes both the "form has to be
  // refilled" bug and the earlier "mpesaPhone never re-syncs" bug.
  const [mpesaPhone, setMpesaPhone] = usePersistedState("auracrib-mpesa-phone", phone);
  useEffect(() => {
    setMpesaPhone((prev) => (prev ? prev : phone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Card fields are sandbox-only and intentionally NOT persisted to
  // localStorage even in test mode — no reason to make a habit of it.
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });

  // Guests who pay by card or PayPal don't have a verified phone number the
  // way M-Pesa guests do, so we ask for one before sending the SMS receipt
  // (Update_Module.md §4b: "prompted to key in Numeric number ... so they
  // get their details").
  const [smsPhone, setSmsPhone] = usePersistedState("auracrib-sms-phone", phone);

  async function payWithMpesa() {
    setStatus("processing");
    setMessage("Sending STK push to your phone (sandbox)...");
    try {
      let result: PaymentResult;
      try {
        const data = await invokeEdgeFunction<EdgeFunctionResponse>("create-payment-intent", {
          provider: "mpesa",
          amount: amountKES,
          phone: mpesaPhone,
          bookingId,
        });
        result = {
          providerRef: data.providerRef,
          transactionId: data.providerRef,
          status: "succeeded",
          simulated: false,
          message: `Enter your M-Pesa PIN on your phone to confirm. Ref: ${data.providerRef}`,
        };
      } catch (err) {
        if (!isBackendNotConfigured(err)) throw err;
        // Sandbox fallback for a frontend running with no Supabase project
        // configured at all — see lib/paymentSimulator.ts.
        result = await simulateMpesaStk(mpesaPhone, amountKES, bookingId);
      }

      if (result.status === "failed") {
        setStatus("error");
        setMessage(result.message);
        return;
      }
      setStatus("success");
      setMessage(result.message);
      onPaid({ provider: "mpesa", providerRef: result.providerRef, transactionId: result.transactionId, smsPhone: mpesaPhone, simulated: result.simulated });
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not process the M-Pesa payment. Please try again.");
    }
  }

  async function payWithStripe() {
    if (!smsPhone.trim()) {
      setStatus("error");
      setMessage("Add a phone number so we can text your booking details too.");
      return;
    }
    setStatus("processing");
    setMessage("Processing card payment (Stripe test mode)...");
    try {
      try {
        const data = await invokeEdgeFunction<EdgeFunctionResponse>("create-payment-intent", {
          provider: "stripe",
          amount: amountKES,
          bookingId,
        });
        if (!data.url) throw new Error("No checkout URL returned");
        // Stripe's hosted Checkout only reaches success_url after the
        // charge has actually succeeded, so the redirect itself is the
        // trustworthy signal — BookingFlow reads it back on return.
        window.location.href = data.url;
        return;
      } catch (err) {
        if (!isBackendNotConfigured(err)) throw err;
        const result = await simulateStripeCheckout(amountKES, bookingId, card);
        if (result.status === "failed") {
          setStatus("error");
          setMessage(result.message);
          return;
        }
        setStatus("success");
        setMessage(result.message);
        onPaid({ provider: "stripe", providerRef: result.providerRef, transactionId: result.transactionId, smsPhone, simulated: true });
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not process the card payment. Please try again.");
    }
  }

  async function payWithPaypal() {
    if (!smsPhone.trim()) {
      setStatus("error");
      setMessage("Add a phone number so we can text your booking details too.");
      return;
    }
    setStatus("processing");
    setMessage("Creating PayPal sandbox order...");
    try {
      try {
        const data = await invokeEdgeFunction<EdgeFunctionResponse>("create-payment-intent", {
          provider: "paypal",
          amount: amountKES,
          bookingId,
        });
        if (!data.approveUrl) throw new Error("No approval URL returned");
        // PayPal still needs an explicit capture call after the guest
        // approves — BookingFlow does that when it sees the `paypal=return`
        // redirect (see supabase/functions/paypal-capture).
        window.location.href = data.approveUrl;
        return;
      } catch (err) {
        if (!isBackendNotConfigured(err)) throw err;
        const result = await simulatePaypalOrder(amountKES, bookingId);
        setStatus("success");
        setMessage(result.message);
        onPaid({ provider: "paypal", providerRef: result.providerRef, transactionId: result.transactionId, smsPhone, simulated: true });
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not process the PayPal payment. Please try again.");
    }
  }

  function handlePay() {
    if (method === "mpesa") return payWithMpesa();
    if (method === "stripe") return payWithStripe();
    return payWithPaypal();
  }

  const tabs: { id: Method; label: string; icon: typeof Smartphone }[] = [
    { id: "mpesa", label: "M-Pesa STK", icon: Smartphone },
    { id: "stripe", label: "Card (Stripe)", icon: CreditCard },
    { id: "paypal", label: "PayPal", icon: Wallet },
  ];

  return (
    <div className="card p-6">
      <h3 className="heading-sub">Payment</h3>
      <p className="text-xs text-ink/50 dark:text-cream/50 mb-4">
        Sandbox / test mode — no real funds are moved.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setMethod(t.id);
              setStatus("idle");
              setMessage("");
            }}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-bold transition-colors ${
              method === t.id
                ? "border-moss bg-moss/10 text-moss"
                : "border-earth/15 dark:border-cream/15 text-ink/60 dark:text-cream/60 hover:border-earth/30 dark:hover:border-cream/30"
            }`}
          >
            <t.icon className="w-4 h-4" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {method === "mpesa" && (
        <div className="mb-4">
          <label htmlFor="mpesa-phone" className="field-label-plain">
            M-Pesa phone number
          </label>
          <input
            id="mpesa-phone"
            value={mpesaPhone}
            onChange={(e) => setMpesaPhone(e.target.value)}
            placeholder="2547XXXXXXXX"
            className="field-input"
          />
        </div>
      )}

      {method === "stripe" && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-ink/70 dark:text-cream/70">
            Sandbox card entry — use test card 4242 4242 4242 4242, any future expiry, any CVC.
          </p>
          <div>
            <label htmlFor="card-number" className="field-label-plain">Card number</label>
            <input
              id="card-number"
              value={card.number}
              onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
              placeholder="4242 4242 4242 4242"
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="card-expiry" className="field-label-plain">Expiry</label>
              <input
                id="card-expiry"
                value={card.expiry}
                onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
                placeholder="12/29"
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="card-cvc" className="field-label-plain">CVC</label>
              <input
                id="card-cvc"
                value={card.cvc}
                onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))}
                placeholder="123"
                className="field-input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="sms-phone-stripe" className="field-label-plain">Phone for SMS confirmation</label>
            <input
              id="sms-phone-stripe"
              value={smsPhone}
              onChange={(e) => setSmsPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              className="field-input"
            />
          </div>
        </div>
      )}

      {method === "paypal" && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-ink/70 dark:text-cream/70">
            You&apos;ll approve this with a PayPal sandbox buyer account.
          </p>
          <div>
            <label htmlFor="sms-phone-paypal" className="field-label-plain">Phone for SMS confirmation</label>
            <input
              id="sms-phone-paypal"
              value={smsPhone}
              onChange={(e) => setSmsPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              className="field-input"
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={status === "processing"}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gold text-ink font-bold px-5 py-3 hover:bg-gold-light transition-colors disabled:opacity-60"
      >
        {status === "processing" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        Pay KES {amountKES.toLocaleString()} (deposit)
      </button>

      {message && (
        <p
          className={`mt-3 text-sm flex items-start gap-2 ${
            status === "error" ? "text-earth-dark dark:text-gold-light" : "text-moss dark:text-moss"
          }`}
        >
          {status === "error" ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {message}
        </p>
      )}
    </div>
  );
}
