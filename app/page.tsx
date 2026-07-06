import Link from "next/link";
import Hero from "@/components/Hero";
import Gallery from "@/components/Gallery";
import Amenities from "@/components/Amenities";
import Testimonials from "@/components/Testimonials";
import LocationMap from "@/components/LocationMap";
import SectionDivider from "@/components/SectionDivider";
import { property } from "@/lib/data";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <>
      <Hero />

      <section className="max-w-4xl mx-auto px-5 pt-16 text-center">
        <h2 className="text-3xl md:text-4xl text-earth-dark mb-4">About the property</h2>
        <p className="text-ink/80 leading-relaxed">{property.description}</p>
      </section>

      <SectionDivider />

      <section className="max-w-6xl mx-auto px-5">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-3xl md:text-4xl text-earth-dark">Gallery</h2>
          <Link href="/property" className="text-sm font-bold text-lagoon inline-flex items-center gap-1 hover:gap-2 transition-all">
            See full gallery <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
        <Gallery limit={6} />
      </section>

      <SectionDivider />

      <section className="max-w-6xl mx-auto px-5">
        <h2 className="text-3xl md:text-4xl text-earth-dark mb-6 text-center">Amenities</h2>
        <Amenities />
      </section>

      <SectionDivider />

      <section className="max-w-6xl mx-auto px-5 grid md:grid-cols-2 gap-8 items-start">
        <div>
          <h2 className="text-3xl md:text-4xl text-earth-dark mb-4">Find us</h2>
          <p className="text-ink/80 leading-relaxed mb-4">
            Tucked off a quiet lane in {property.location}, twenty minutes from the city centre
            and close to the forest trails.
          </p>
        </div>
        <LocationMap />
      </section>

      <SectionDivider />

      <section className="max-w-6xl mx-auto px-5 pb-20">
        <h2 className="text-3xl md:text-4xl text-earth-dark mb-6 text-center">What guests say</h2>
        <Testimonials />
      </section>

      <section className="bg-moss text-cream">
        <div className="max-w-4xl mx-auto px-5 py-16 text-center">
          <h2 className="text-3xl md:text-4xl mb-4">Ready for a quiet few days?</h2>
          <p className="text-cream/85 mb-6">Check dates, see pricing, and hold the cottage in minutes.</p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-gold text-ink font-bold rounded-full px-7 py-3 hover:bg-gold-light transition-colors"
          >
            Book Now <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
