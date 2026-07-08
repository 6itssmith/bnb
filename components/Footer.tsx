import { MapPin, Mail, Phone } from "lucide-react";
import { property } from "@/lib/data";

export default function Footer() {
  return (
    <footer className="bg-earth-dark text-cream mt-24">
      <div className="max-w-6xl mx-auto px-5 py-14 grid gap-10 md:grid-cols-3">
        <div>
          <h3 className="font-display text-2xl mb-3">{property.name}</h3>
          <p className="text-cream/80 text-sm leading-relaxed">
            A single private property, booked one party at a time. Warm hospitality,
            honest pricing, no surprises.
          </p>
        </div>

        <div>
          <h4 className="font-bold mb-3 text-gold-light">Reach us</h4>
          <ul className="space-y-2 text-sm text-cream/85">
            <li className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gold-light shrink-0" aria-hidden="true" />
              {property.location}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gold-light shrink-0" aria-hidden="true" />
              {property.supportPhone}
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gold-light shrink-0" aria-hidden="true" />
              {property.supportEmail}
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-3 text-gold-light">Good to know</h4>
          <ul className="space-y-2 text-sm text-cream/85">
            <li>Check-in 2:00 PM &middot; Check-out 11:00 AM</li>
            <li>Free cancellation up to 14 days out</li>
            <li>M-Pesa, Stripe, and PayPal accepted</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-cream/15 py-5 text-center text-xs text-cream/60">
        &copy; {new Date().getFullYear()} {property.name}. All rights reserved.
      </div>
    </footer>
  );
}
