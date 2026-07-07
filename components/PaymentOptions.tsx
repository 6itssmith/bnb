"use client";

import { useState } from "react";
import { Smartphone, CreditCard, Wallet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabase/functions";

type Method = "mpesa" | "stripe" | "paypal";
type Status = "idle" | "processing" | "success" | "error";

type Props = {
  amountKES: number;
  phone: string;
  bookingId: string;
  onPaid: () => void;
};

type CreatePaymentIntentResponse = {
  providerRef: string;
  url?: string;
  approveUrl?: string;
  paymentId: string;
  bookingId: string;
};

// All three flows call the `create-payment-intent` Supabase Edge Function,
// which talks to Daraja/Stripe/PayPal sandbox APIs with the real secret
// keys server-side and records a `payments` row. See
// supabase/functions/create-payment-intent/index.ts and
// lib/supabase/functions.ts for why this goes straight to the Edge
// Function rather than a Next.js API route.

export default function PaymentOptions({ amountKES, phone, bookingId, onPaid }: Props) {
  const [method, setMethod] = useState<Method>("mpesa");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState(phone);

  async function payWithMpesa() {
    setStatus("processing");
    setMessage("Sending STK push to your phone (sandbox)...");
    try {
      const data = await invokeEdgeFunction<CreatePaymentIntentResponse>("create-payment-intent", {
        provider: "mpesa",
        amount: amountKES,
        phone: mpesaPhone,
        bookingId,
      });
      setMessage(`Enter your M-Pesa PIN on your phone to confirm. Ref: ${data.providerRef}`);
      setStatus("success");
      onPaid();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not reach the M-Pesa sandbox. Please try again.");
    }
  }

  async function payWithStripe() {
    setStatus("processing");
    setMessage("Creating Stripe test checkout session...");
    try {
      const data = await invokeEdgeFunction<CreatePaymentIntentResponse>("create-payment-intent", {
        provider: "stripe",
        amount: amountKES,
        bookingId,
      });
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not reach the Stripe sandbox. Please try again.");
    }
  }

  async function payWithPaypal() {
    setStatus("processing");
    setMessage("Creating PayPal sandbox order...");
    try {
      const data = await invokeEdgeFunction<CreatePaymentIntentResponse>("create-payment-intent", {
        provider: "paypal",
        amount: amountKES,
        bookingId,
      });
      if (!data.approveUrl) throw new Error("No approval URL returned");
      window.location.href = data.approveUrl;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not reach the PayPal sandbox. Please try again.");
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
      <h3 className="font-bold text-earth-dark text-lg mb-1">Payment</h3>
      <p className="text-xs text-ink/50 mb-4">
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
                : "border-earth/15 text-ink/60 hover:border-earth/30"
            }`}
          >
            <t.icon className="w-4 h-4" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {method === "mpesa" && (
        <div className="mb-4">
          <label htmlFor="mpesa-phone" className="text-xs font-bold text-earth-dark mb-1.5 block">
            M-Pesa phone number
          </label>
          <input
            id="mpesa-phone"
            value={mpesaPhone}
            onChange={(e) => setMpesaPhone(e.target.value)}
            placeholder="2547XXXXXXXX"
            className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
          />
        </div>
      )}

      {method === "stripe" && (
        <p className="text-sm text-ink/70 mb-4">
          You&apos;ll be redirected to a Stripe test-mode checkout page. Use card
          4242 4242 4242 4242, any future expiry, any CVC.
        </p>
      )}

      {method === "paypal" && (
        <p className="text-sm text-ink/70 mb-4">
          You&apos;ll be redirected to a PayPal sandbox login to approve the order
          with a sandbox buyer account.
        </p>
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
            status === "error" ? "text-earth-dark" : "text-moss"
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
