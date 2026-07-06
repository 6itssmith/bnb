"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

export default function ContactForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Wire this to POST /api/contact (see BACKEND_SETUP.md) to forward to email/CRM.
    setSent(true);
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
          <input id="contact-name" required className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon" />
        </div>
        <div>
          <label htmlFor="contact-email" className="text-xs font-bold text-earth-dark mb-1.5 block">Email</label>
          <input id="contact-email" type="email" required className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon" />
        </div>
      </div>
      <div>
        <label htmlFor="contact-message" className="text-xs font-bold text-earth-dark mb-1.5 block">Message</label>
        <textarea id="contact-message" required rows={4} className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon resize-none" />
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-full bg-moss text-cream font-bold px-6 py-2.5 hover:bg-moss-dark transition-colors"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        Send message
      </button>
    </form>
  );
}
