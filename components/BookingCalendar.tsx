"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

// In production this list comes from GET /api/availability?month=YYYY-MM
// (see BACKEND_SETUP.md). Hard-coded here so the frontend is demoable stand-alone.
const MOCK_UNAVAILABLE = new Set<string>([
  format(addMonths(new Date(), 0), "yyyy-MM-") + "18",
  format(addMonths(new Date(), 0), "yyyy-MM-") + "19",
  format(addMonths(new Date(), 1), "yyyy-MM-") + "02",
]);

type Props = {
  checkIn: Date | null;
  checkOut: Date | null;
  onChange: (checkIn: Date | null, checkOut: Date | null) => void;
};

export default function BookingCalendar({ checkIn, checkOut, onChange }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const today = startOfDay(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(visibleMonth);
    const end = endOfMonth(visibleMonth);
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const leadingBlanks = getDay(startOfMonth(visibleMonth));

  function isUnavailable(day: Date) {
    return MOCK_UNAVAILABLE.has(format(day, "yyyy-MM-dd"));
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
        <p className="font-bold text-earth-dark">{format(visibleMonth, "MMMM yyyy")}</p>
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
          const unavailable = isUnavailable(day);
          const past = isBefore(day, today);
          const isCheckIn = checkIn && isSameDay(day, checkIn);
          const isCheckOut = checkOut && isSameDay(day, checkOut);
          const inRange =
            checkIn && checkOut && isWithinInterval(day, { start: checkIn, end: checkOut });

          return (
            <button
              type="button"
              key={day.toISOString()}
              disabled={past || unavailable}
              onClick={() => handleDayClick(day)}
              className={[
                "aspect-square rounded-lg text-sm font-semibold transition-colors",
                past || unavailable
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
        Dates shown in grey are already booked. Selected dates hold for 15 minutes while you complete checkout.
      </p>
    </div>
  );
}
