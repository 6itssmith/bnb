import Testimonials from "@/components/Testimonials";
import SectionDivider from "@/components/SectionDivider";
import ContactForm from "@/components/ContactForm";
import { property } from "@/lib/data";

export const metadata = {
  title: `Reviews & Contact | ${property.name}`,
};

export default function ReviewsPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <header className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl md:text-5xl text-earth-dark mb-4">Reviews & Contact</h1>
        <p className="text-ink/80 leading-relaxed">
          Read what recent guests have said, or send us a question directly — we usually
          reply within a few hours.
        </p>
      </header>

      <Testimonials />

      <SectionDivider />

      <section className="max-w-2xl mx-auto">
        <h2 className="text-3xl text-earth-dark mb-6 text-center">Send a message</h2>
        <ContactForm />
      </section>
    </div>
  );
}
