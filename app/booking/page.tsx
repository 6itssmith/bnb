import { Suspense } from "react";
import BookingFlow from "@/components/BookingFlow";

export const metadata = {
  title: "Book Your Stay | The Ridgeview Cottage",
};

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-5 py-24 text-center">Loading booking form...</div>}>
      <BookingFlow />
    </Suspense>
  );
}
