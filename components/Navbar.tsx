"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Leaf } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/property", label: "The Property" },
  { href: "/booking", label: "Book" },
  { href: "/reviews", label: "Reviews & Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-cream/90 dark:bg-ink/90 backdrop-blur border-b border-earth/10 dark:border-cream/10">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-moss" aria-hidden="true" />
          <span className="font-display text-xl text-earth-dark dark:text-cream">The Ridgeview Cottage</span>
        </Link>

        <ul className="hidden md:flex items-center gap-8 text-sm font-semibold dark:text-cream">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-moss transition-colors">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/booking"
            className="inline-flex items-center rounded-full bg-moss text-cream px-5 py-2.5 text-sm font-bold shadow-card hover:bg-moss-dark transition-colors"
          >
            Book Now
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            className="p-2 dark:text-cream"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {open && (
        <ul className="md:hidden flex flex-col gap-1 px-5 pb-5 text-sm font-semibold dark:text-cream">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block py-2.5 border-b border-earth/10 dark:border-cream/10"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="pt-3">
            <Link
              href="/booking"
              onClick={() => setOpen(false)}
              className="block text-center rounded-full bg-moss text-cream px-5 py-2.5 font-bold"
            >
              Book Now
            </Link>
          </li>
        </ul>
      )}
    </header>
  );
}
