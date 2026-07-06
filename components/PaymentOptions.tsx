"use client";

import { useState } from "react";
import { Smartphone, CreditCard, Wallet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Method = "mpesa" | "stripe" | "paypal";
type Status = "idle" | "processing" | "success" | "error";

type Props = {
  amountKES: number;
  phone: string;
  onPaid: () => void;
};

// All requests below target the backend described in BACKEND_SETUP.md and run
// against sandbox/test credentials (Daraja sandbox, Stripe test mode, PayPal sandbox).
// If NEXT_PUBLIC_API_BASE_URL is not set, calls fail gracefully with a clear message
// so the frontend remains demoable on its own.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function PaymentOptions({ amountKES, phone, onPaid }: Props) {
  const [method, setMethod] = useState<Method>("mpesa");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState(phone);

  async function payWithMpesa() {
    setStatus("processing");
    setMessage("Sending STK push to your phone (sandbox)...");
    try {
      const res = await fetch(`${API_BASE}/api/payments/mpesa/stkpush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mpesaPhone, amount: amountKES }),
      });
      if (!res.ok) throw new Error("STK push request failed");
      const data = await res.json();
      setMessage(`Enter your M-Pesa PIN on your phone to confirm. Ref: ${data.checkoutRequestId ?? "N/A"}`);
      setStatus("success");
      onPaid();
    } catch (err) {
      setStatus("error");
      setMessage(
        "Could not reach the payment backend. Connect NEXT_PUBLIC_API_BASE_URL to the Daraja sandbox endpoint described in BACKEND_SETUP.md."
      );
    }
  }

  async function payWithStripe() {
    setStatus("processing");
    setMessage("Creating Stripe test checkout session...");
    try {
      const res = await fetch(`${API_BASE}/api/payments/stripe/checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKES }),
      });
      if (!res.ok) throw new Error("Stripe session failed");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned");
    } catch (err) {
      setStatus("error");
      setMessage(
        "Could not reach the payment backend. Connect NEXT_PUBLIC_API_BASE_URL to a Stripe test-mode session endpoint."
      );
    }
  }

  async function payWithPaypal() {
    setStatus("processing");
    setMessage("Creating PayPal sandbox order...");
    try {
      const res = await fetch(`${API_BASE}/api/payments/paypal/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKES }),
      });
      if (!res.ok) throw new Error("PayPal order failed");
      const data = await res.json();
      if (data.approveUrl) {
        window.location.href = data.approveUrl;
        return;
      }
      throw new Error("No approval URL returned");
    } catch (err) {
      setStatus("error");
      setMessage(
        "Could not reach the payment backend. Connect NEXT_PUBLIC_API_BASE_URL to a PayPal sandbox order endpoint."
      );
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
