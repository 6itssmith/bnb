"use client";

import { User, Mail, Phone, MessageSquare } from "lucide-react";

export type GuestDetails = {
  fullName: string;
  email: string;
  phone: string;
  notes: string;
};

type Props = {
  value: GuestDetails;
  onChange: (value: GuestDetails) => void;
};

export default function GuestForm({ value, onChange }: Props) {
  function set<K extends keyof GuestDetails>(key: K, v: GuestDetails[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="bg-white rounded-xl2 shadow-card border border-earth/10 p-6 space-y-4">
      <h3 className="font-bold text-earth-dark text-lg mb-1">Guest details</h3>

      <div>
        <label htmlFor="fullName" className="flex items-center gap-1.5 text-xs font-bold text-earth-dark mb-1.5">
          <User className="w-3.5 h-3.5" aria-hidden="true" /> Full name
        </label>
        <input
          id="fullName"
          required
          value={value.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
          placeholder="Jane Wanjiru"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="flex items-center gap-1.5 text-xs font-bold text-earth-dark mb-1.5">
            <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label htmlFor="phone" className="flex items-center gap-1.5 text-xs font-bold text-earth-dark mb-1.5">
            <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Phone (for M-Pesa)
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon"
            placeholder="0712 345 678"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="flex items-center gap-1.5 text-xs font-bold text-earth-dark mb-1.5">
          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Special requests (optional)
        </label>
        <textarea
          id="notes"
          rows={3}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="w-full rounded-lg border border-earth/20 px-3 py-2.5 text-sm focus:border-lagoon resize-none"
          placeholder="Late arrival, dietary notes, celebration, etc."
        />
      </div>
    </div>
  );
}
