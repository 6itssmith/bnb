import {
  Wifi,
  Car,
  UtensilsCrossed,
  Flame,
  Trees,
  ShieldCheck,
  Bath,
  Dog,
  type LucideIcon,
} from "lucide-react";
import { amenities } from "@/lib/data";

const iconMap: Record<string, LucideIcon> = {
  Wifi,
  Car,
  UtensilsCrossed,
  Flame,
  Trees,
  ShieldCheck,
  Bath,
  Dog,
};

export default function Amenities() {
  return (
    <ul className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
      {amenities.map((a) => {
        const Icon = iconMap[a.icon] ?? Wifi;
        return (
          <li
            key={a.label}
            className="flex flex-col items-center text-center gap-2.5 card p-5"
          >
            <span className="w-11 h-11 rounded-full bg-moss/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-moss" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-ink dark:text-cream">{a.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
