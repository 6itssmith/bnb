"use client";

import { useEffect, useRef, useState } from "react";
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
import { paymentReference } from "@/lib/reference";

type Method = "mpesa" | "stripe" | "paypal";
type Status = "idle" | "processing" | "waiting" | "success" | "error";

export type PaymentSuccess = {
  provider: Method;
  transactionId: string; // always the AURACRIB-formatted reference — never a raw provider string
  smsPhone: string;
};

type Props = {
  amountKES: number;
  phone: string;
  bookingId: string;
  onPaid: (result: PaymentSuccess) => void;
};

type CreateIntentResponse = {
  providerRef: string;
  url?: string;
  approveUrl?: string;
};

type StatusResponse = {
  status: "initiated" | "succeeded" | "failed" | "not_found";
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

export default function PaymentOptions({ amountKES, phone, bookingId, onPaid }: Props) {
  const [method, setMethod] = useState<Method>("mpesa");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const [mpesaPhone, setMpesaPhone] = usePersistedState("auracrib-mpesa-phone", phone);
  useEffect(() => {
    setMpesaPhone((prev) => (prev ? prev : phone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Guests who pay by card or PayPal don't have a verified phone number the
  // way M-Pesa guests do, so we ask for one to send the SMS receipt to.
  const [smsPhone, setSmsPhone] = usePersistedState("auracrib-sms-phone", phone);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function pollMpesaStatus() {
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    pollRef.current = setInterval(async () => {
      if (Date.now() > pollDeadlineRef.current) {
        stopPolling();
        setStatus("error");
        setMessage(
          "Still waiting on confirmation from Safaricom. If you completed the prompt, this can take a little longer — otherwise please try again.",
        );
        return;
      }

      try {
        const data = await invokeEdgeFunction<StatusResponse>("check-payment-status", {
          bookingId,
          provider: "mpesa",
        });

        if (data.status === "succeeded") {
          stopPolling();
          const ref = paymentReference("mpesa", bookingId);
          setStatus("success");
          setMessage(`Payment confirmed via M-Pesa. Ref: ${ref}`);
          onPaid({ provider: "mpesa", transactionId: ref, smsPhone: mpesaPhone });
        } else if (data.status === "failed") {
          stopPolling();
          setStatus("error");
          setMessage("The M-Pesa payment wasn't completed. Please try again.");
        }
        // "initiated" / "not_found" — keep waiting, keep polling.
      } catch {
        // A transient poll failure isn't fatal — just try again next tick.
      }
    }, POLL_INTERVAL_MS);
  }

  async function payWithMpesa() {
    setStatus("processing");
    setMessage("Sending STK push to your phone...");
    try {
      await invokeEdgeFunction<CreateIntentResponse>("create-payment-intent", {
        provider: "mpesa",
        amount: amountKES,
        phone: mpesaPhone,
        bookingId,
      });
      setStatus("waiting");
      setMessage("Check your phone and enter your M-Pesa PIN to confirm.");
      pollMpesaStatus();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not send the STK push. Please try again.");
    }
  }

  async function payWithStripe() {
    if (!smsPhone.trim()) {
      setStatus("error");
      setMessage("Add a phone number so we can text your booking details too.");
      return;
    }
    setStatus("processing");
    setMessage("Redirecting to Stripe...");
    try {
      const data = await invokeEdgeFunction<CreateIntentResponse>("create-payment-intent", {
        provider: "stripe",
        amount: amountKES,
        bookingId,
      });
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not start the card payment. Please try again.");
    }
  }

  async function payWithPaypal() {
    if (!smsPhone.trim()) {
      setStatus("error");
      setMessage("Add a phone number so we can text your booking details too.");
      return;
    }
    setStatus("processing");
    setMessage("Redirecting to PayPal...");
    try {
      const data = await invokeEdgeFunction<CreateIntentResponse>("create-payment-intent", {
        provider: "paypal",
        amount: amountKES,
        bookingId,
      });
      if (!data.approveUrl) throw new Error("No approval URL returned");
      // PayPal still needs an explicit capture call after the guest
      // approves — BookingFlow does that when it sees the `paypal=return`
      // redirect (see supabase/functions/paypal-capture).
      window.location.href = data.approveUrl;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not start the PayPal payment. Please try again.");
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

  const busy = status === "processing" || status === "waiting";

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
            disabled={busy}
            onClick={() => {
              stopPolling();
              setMethod(t.id);
              setStatus("idle");
              setMessage("");
            }}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
            disabled={busy}
            onChange={(e) => setMpesaPhone(e.target.value)}
            placeholder="2547XXXXXXXX"
            className="field-input disabled:opacity-60"
          />
        </div>
      )}

      {method === "stripe" && (
        <div className="mb-4 space-y-3">
          <p className="text-sm text-ink/70 dark:text-cream/70">
            You&apos;ll be taken to Stripe&apos;s secure test-mode checkout to complete payment.
          </p>
          <div>
            <label htmlFor="sms-phone-stripe" className="field-label-plain">Phone for SMS confirmation</label>
            <input
              id="sms-phone-stripe"
              value={smsPhone}
              disabled={busy}
              onChange={(e) => setSmsPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              className="field-input disabled:opacity-60"
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
              disabled={busy}
              onChange={(e) => setSmsPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              className="field-input disabled:opacity-60"
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gold text-ink font-bold px-5 py-3 hover:bg-gold-light transition-colors disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
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
          ) : status === "waiting" ? (
            <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {message}
        </p>
      )}
    </div>
  );
}
