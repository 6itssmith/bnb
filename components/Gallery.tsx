import Image from "next/image";
import { gallery } from "@/lib/data";

export default function Gallery({ limit }: { limit?: number }) {
  const images = limit ? gallery.slice(0, limit) : gallery;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
      {images.map((img, i) => (
        <div
          key={img.src}
          className={`relative overflow-hidden rounded-xl2 shadow-card ${
            i === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-[4/3]" : "aspect-square"
          }`}
        >
          <Image
            src={img.src}
            alt={img.alt}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover hover:scale-105 transition-transform duration-500"
          />
        </div>
      ))}
    </div>
  );
}
