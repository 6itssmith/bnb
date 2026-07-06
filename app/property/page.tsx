import Link from "next/link";
import Gallery from "@/components/Gallery";
import Amenities from "@/components/Amenities";
import LocationMap from "@/components/LocationMap";
import SectionDivider from "@/components/SectionDivider";
import { property, policies } from "@/lib/data";
import { ArrowRight, FileText } from "lucide-react";

export const metadata = {
  title: `Property Details | ${property.name}`,
};

export default function PropertyPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <header className="text-center max-w-2xl mx-auto mb-12">
        <p className="text-xs font-bold uppercase tracking-wide text-moss mb-2">
          {property.location}
        </p>
        <h1 className="text-4xl md:text-5xl text-earth-dark mb-4">{property.name}</h1>
        <p className="text-ink/80 leading-relaxed">{property.description}</p>
      </header>

      <Gallery />

      <SectionDivider />

      <section>
        <h2 className="text-3xl text-earth-dark mb-6 text-center">Amenities</h2>
        <Amenities />
      </section>

      <SectionDivider />

      <section className="grid md:grid-cols-2 gap-10">
        <div>
          <h2 className="text-3xl text-earth-dark mb-4 flex items-center gap-2">
            <FileText className="w-6 h-6 text-moss" aria-hidden="true" />
            Policies
          </h2>
          <ul className="space-y-3">
            {policies.map((p) => (
              <li key={p} className="flex gap-3 text-sm text-ink/85">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <LocationMap />
      </section>

      <div className="text-center mt-14">
        <Link
          href="/booking"
          className="inline-flex items-center gap-2 bg-moss text-cream font-bold rounded-full px-7 py-3 hover:bg-moss-dark transition-colors"
        >
          Check availability <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
