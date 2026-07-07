import { Quote } from "lucide-react";
import { testimonials } from "@/lib/data";

export default function Testimonials() {
  return (
    <div className="grid md:grid-cols-3 gap-5">
      {testimonials.map((t) => (
        <figure
          key={t.name}
          className="card p-6 flex flex-col"
        >
          <Quote className="w-6 h-6 text-gold mb-3" aria-hidden="true" />
          <blockquote className="text-sm leading-relaxed text-ink/85 flex-1">
            {t.quote}
          </blockquote>
          <figcaption className="mt-4 pt-4 border-t border-earth/10">
            <p className="font-bold text-sm text-earth-dark">{t.name}</p>
            <p className="text-xs text-ink/60">{t.stay}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
