import { property } from "@/lib/data";
import { MapPin } from "lucide-react";

export default function LocationMap() {
  const bbox = `${property.lng - 0.01}%2C${property.lat - 0.01}%2C${property.lng + 0.01}%2C${property.lat + 0.01}`;
  const marker = `${property.lat}%2C${property.lng}`;

  return (
    <div className="rounded-xl2 overflow-hidden shadow-card border border-earth/10">
      <iframe
        title="Property location map"
        className="w-full h-72 md:h-96"
        loading="lazy"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`}
      />
      <div className="bg-white px-5 py-3 flex items-center gap-2 text-sm font-semibold text-earth-dark">
        <MapPin className="w-4 h-4 text-moss" aria-hidden="true" />
        {property.location}
      </div>
    </div>
  );
}
