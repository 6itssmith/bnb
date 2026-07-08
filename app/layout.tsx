import type { Metadata } from "next";
import { Nunito, Quintessential } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ThemeProvider, ThemeInitScript } from "@/components/ThemeProvider";
import AOSInit from "@/components/AOSInit";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-nunito",
  display: "swap",
});

const quintessential = Quintessential({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-quintessential",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aura Crib | A Private B&B Retreat",
  description:
    "Book a stay at Aura Crib — a single, private B&B property with garden views, warm hospitality, and easy online booking.",
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.variable} ${quintessential.variable}`} suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body>
        <ThemeProvider>
          <AOSInit />
          <Navbar />
          <main>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
