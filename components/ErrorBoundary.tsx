"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Shown as the heading in the fallback card. */
  title?: string;
};

type State = {
  hasError: boolean;
};

/**
 * Booking page fix: previously, any render-time error inside `BookingFlow`
 * (e.g. an Invalid Date reaching `date-fns`) had no boundary to catch it,
 * so the page appeared stuck on the parent `<Suspense>` fallback
 * ("Loading booking form...") indefinitely with no way to recover short of
 * a manual reload. This boundary catches those errors locally and offers
 * a "Try again" action, scoped to just the booking flow.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("Booking flow error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto px-5 py-24 text-center">
          <AlertTriangle className="w-8 h-8 text-earth-dark mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-earth-dark mb-2">
            {this.props.title ?? "Something went wrong loading this page"}
          </h2>
          <p className="text-ink/70 dark:text-cream/70 mb-6">
            This can happen with an out-of-date link. Try again, or head back and start a new
            search.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-2 rounded-full bg-moss text-cream font-bold px-6 py-3 hover:bg-moss-dark transition-colors"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
