"use client";

import { useState } from "react";
import { Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("contact_messages")
        .insert({ name, email, message });
      if (insertError) throw new Error(insertError.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="card p-8 text-center">
        <CheckCircle2 className="w-8 h-8 text-moss mx-auto mb-3" aria-hidden="true" />
        <p className="font-bold text-earth-dark">Message sent</p>
        <p className="text-sm text-ink/70 mt-1">We&apos;ll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className="text-xs font-bold text-earth-dark mb-1.5 block">Name</label>
          <input
            id="contact-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="text-xs font-bold text-earth-dark mb-1.5 block">Email</label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
          />
        </div>
      </div>
      <div>
        <label htmlFor="contact-message" className="text-xs font-bold text-earth-dark mb-1.5 block">Message</label>
        <textarea
          id="contact-message"
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon resize-none"
        />
      </div>
      {error && (
        <p className="flex items-start gap-2 text-sm text-earth-dark">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-full bg-moss text-cream font-bold px-6 py-2.5 hover:bg-moss-dark transition-colors disabled:opacity-60"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
        Send message
      </button>
    </form>
  );
}
