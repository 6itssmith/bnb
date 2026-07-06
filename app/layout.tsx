import type { Metadata } from "next";
import { Nunito, Quintessential } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
  title: "The Ridgeview Cottage | A Private B&B Retreat",
  description:
    "Book a stay at The Ridgeview Cottage — a single, private B&B property with garden views, warm hospitality, and easy online booking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.variable} ${quintessential.variable}`}>
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
