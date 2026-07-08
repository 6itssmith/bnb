import Image from "next/image";
import { property } from "@/lib/data";
import QuickAvailability from "@/components/QuickAvailability";

export default function Hero() {
  return (
    <section className="relative">
      <div className="relative h-[78vh] min-h-[520px] w-full overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=80"
          alt="Aura Crib exterior surrounded by garden at golden hour"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-ink/10" />

        <div className="relative z-10 h-full max-w-6xl mx-auto px-5 flex flex-col justify-end pb-16 md:pb-24">
          <p className="reveal text-cream/90 font-semibold tracking-wide uppercase text-xs md:text-sm mb-3">
            {property.location}
          </p>
          <h1 className="reveal text-4xl md:text-6xl text-cream max-w-2xl leading-tight">
            {property.tagline}
          </h1>
        </div>
      </div>

      {/* Signature element: floating quick-availability widget bridging hero and content */}
      <div className="relative z-20 max-w-4xl mx-auto px-5 -mt-14 md:-mt-16">
        <QuickAvailability />
      </div>
    </section>
  );
}
