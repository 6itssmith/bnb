import { differenceInCalendarDays, format } from "date-fns";
import { Receipt } from "lucide-react";
import { property } from "@/lib/data";

type Props = {
  checkIn: Date | null;
  checkOut: Date | null;
  guests: number;
};

const SERVICE_FEE_RATE = 0.05;
const DEPOSIT_RATE = 0.5;

export function computeTotals(checkIn: Date | null, checkOut: Date | null) {
  const nights = checkIn && checkOut ? Math.max(differenceInCalendarDays(checkOut, checkIn), 0) : 0;
  const subtotal = nights * property.basePricePerNight;
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
  const total = subtotal + serviceFee;
  const deposit = Math.round(total * DEPOSIT_RATE);
  return { nights, subtotal, serviceFee, total, deposit };
}

export default function PricingSummary({ checkIn, checkOut, guests }: Props) {
  const { nights, subtotal, serviceFee, total, deposit } = computeTotals(checkIn, checkOut);

  return (
    <div className="bg-white rounded-xl2 shadow-card border border-earth/10 p-6 sticky top-24">
      <h3 className="font-bold text-earth-dark text-lg mb-4 flex items-center gap-2">
        <Receipt className="w-5 h-5 text-moss" aria-hidden="true" />
        Price summary
      </h3>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink/70">Check-in</dt>
          <dd className="font-semibold">{checkIn ? format(checkIn, "d MMM yyyy") : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink/70">Check-out</dt>
          <dd className="font-semibold">{checkOut ? format(checkOut, "d MMM yyyy") : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink/70">Guests</dt>
          <dd className="font-semibold">{guests}</dd>
        </div>
      </dl>

      <hr className="my-4 border-earth/10" />

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink/70">
            KES {property.basePricePerNight.toLocaleString()} &times; {nights} night{nights === 1 ? "" : "s"}
          </dt>
          <dd className="font-semibold">KES {subtotal.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink/70">Service fee</dt>
          <dd className="font-semibold">KES {serviceFee.toLocaleString()}</dd>
        </div>
      </dl>

      <hr className="my-4 border-earth/10" />

      <div className="flex justify-between text-base font-bold text-earth-dark">
        <span>Total</span>
        <span>KES {total.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-sm text-moss font-semibold mt-1">
        <span>Due now (50% deposit)</span>
        <span>KES {deposit.toLocaleString()}</span>
      </div>
    </div>
  );
}
