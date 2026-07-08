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
    <div className="card p-6 space-y-4">
      <h3 className="heading-sub">Guest details</h3>

      <div>
        <label htmlFor="fullName" className="field-label">
          <User className="w-3.5 h-3.5" aria-hidden="true" /> Full name
        </label>
        <input
          id="fullName"
          required
          value={value.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          className="field-input"
          placeholder="Jane Wanjiru"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="field-label">
            <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            className="field-input"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">
            <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Phone (for M-Pesa)
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="field-input"
            placeholder="0712 345 678"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="field-label">
          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Special requests (optional)
        </label>
        <textarea
          id="notes"
          rows={3}
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="field-input resize-none"
          placeholder="Late arrival, dietary notes, celebration, etc."
        />
      </div>
    </div>
  );
}
