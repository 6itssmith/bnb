"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, Users, Search } from "lucide-react";
import { usePersistedState } from "@/lib/usePersistedState";

export default function QuickAvailability() {
  const router = useRouter();
  const [checkIn, setCheckIn] = usePersistedState("auracrib-quick-checkin", "");
  const [checkOut, setCheckOut] = usePersistedState("auracrib-quick-checkout", "");
  const [guests, setGuests] = usePersistedState("auracrib-quick-guests", 2);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    params.set("guests", String(guests));
    router.push(`/booking?${params.toString()}`);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/95 dark:bg-ink/80 rounded-xl2 shadow-soft p-5 md:p-6 grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] items-end border border-earth/10 dark:border-cream/10"
    >
      <div>
        <label htmlFor="check-in" className="field-label">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          Check-in
        </label>
        <input
          id="check-in"
          type="date"
          min={today}
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          required
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="check-out" className="field-label">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          Check-out
        </label>
        <input
          id="check-out"
          type="date"
          min={checkIn || today}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          required
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="guests" className="field-label">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Guests
        </label>
        <input
          id="guests"
          type="number"
          min={1}
          max={10}
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          className="field-input w-20"
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold text-ink font-bold px-5 py-2.5 hover:bg-gold-light transition-colors"
      >
        <Search className="w-4 h-4" aria-hidden="true" />
        Check availability
      </button>
    </form>
  );
}
