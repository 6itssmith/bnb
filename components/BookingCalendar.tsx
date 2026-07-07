"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isSameDay,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { createClient } from "@/lib/supabase/client";

type Props = {
  checkIn: Date | null;
  checkOut: Date | null;
  onChange: (checkIn: Date | null, checkOut: Date | null) => void;
};

export default function BookingCalendar({ checkIn, checkOut, onChange }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const today = startOfDay(new Date());

  // Every date that's either inside an existing (pending/confirmed)
  // booking's range, or explicitly blocked by the owner. Loaded from
  // Supabase — `booked_ranges` only exposes check_in/check_out (never
  // guest PII, see 001_init.sql) and `blocked_dates` is world-readable by
  // design, so both are safe to query with the anon key straight from the
  // browser.
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadAvailability() {
      setLoading(true);
      setLoadError(null);
      try {
        const [rangesRes, blockedRes] = await Promise.all([
          supabase.from("booked_ranges").select("check_in, check_out"),
          supabase.from("blocked_dates").select("date"),
        ]);
        if (rangesRes.error) throw new Error(rangesRes.error.message);
        if (blockedRes.error) throw new Error(blockedRes.error.message);

        const days = new Set<string>();
        for (const range of rangesRes.data ?? []) {
          const start = new Date(`${range.check_in}T00:00:00`);
          const end = new Date(`${range.check_out}T00:00:00`);
          for (const day of eachDayOfInterval({ start, end })) {
            // check_out night itself is free (guest leaves that morning);
            // eachDayOfInterval is inclusive of `end`, so drop the last day.
            if (!isSameDay(day, end)) days.add(format(day, "yyyy-MM-dd"));
          }
        }
        for (const row of blockedRes.data ?? []) {
          days.add(row.date as string);
        }

        if (!cancelled) setUnavailable(days);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load availability.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAvailability();
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(() => {
    const start = startOfMonth(visibleMonth);
    const end = endOfMonth(visibleMonth);
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const leadingBlanks = getDay(startOfMonth(visibleMonth));

  function isUnavailable(day: Date) {
    return unavailable.has(format(day, "yyyy-MM-dd"));
  }

  function handleDayClick(day: Date) {
    if (isBefore(day, today) || isUnavailable(day)) return;

    if (!checkIn || (checkIn && checkOut)) {
      onChange(day, null);
      return;
    }
    if (isBefore(day, checkIn) || isSameDay(day, checkIn)) {
      onChange(day, null);
      return;
    }
    onChange(checkIn, day);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => addMonths(m, -1))}
          className="p-2 rounded-full hover:bg-earth/10"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <p className="font-bold text-earth-dark flex items-center gap-2">
          {format(visibleMonth, "MMMM yyyy")}
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink/40" aria-hidden="true" />}
        </p>
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
          className="p-2 rounded-full hover:bg-earth/10"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink/50 mb-2">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={`${d}-${i}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const dayUnavailable = isUnavailable(day);
          const past = isBefore(day, today);
          const isCheckIn = checkIn && isSameDay(day, checkIn);
          const isCheckOut = checkOut && isSameDay(day, checkOut);
          const inRange =
            checkIn && checkOut && isWithinInterval(day, { start: checkIn, end: checkOut });

          return (
            <button
              type="button"
              key={day.toISOString()}
              disabled={past || dayUnavailable}
              onClick={() => handleDayClick(day)}
              className={[
                "aspect-square rounded-lg text-sm font-semibold transition-colors",
                past || dayUnavailable
                  ? "text-ink/25 line-through cursor-not-allowed"
                  : "hover:bg-lagoon/10 cursor-pointer",
                isCheckIn || isCheckOut ? "bg-moss text-cream hover:bg-moss" : "",
                inRange && !isCheckIn && !isCheckOut ? "bg-gold/20" : "",
              ].join(" ")}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-ink/50 mt-4">
        {loadError
          ? "Couldn't load live availability — showing this month with no dates blocked. Please double-check before paying."
          : "Dates shown in grey are already booked. Selected dates hold for 15 minutes while you complete checkout."}
      </p>
    </div>
  );
}
