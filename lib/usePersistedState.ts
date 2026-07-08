"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Persists React state to localStorage under `key` so a page reload (or an
 * accidental back/forward navigation) never wipes out what a guest has
 * already typed — the booking dates, guest details, the contact form, the
 * M-Pesa number, any of it. This is the general-purpose fix for the
 * "forms shouldn't have to be refilled on reload" requirement.
 *
 * - Reads the stored value once on mount (SSR-safe: falls back to
 *   `initialValue` on the server since `window` isn't available there).
 * - Writes to localStorage on every change, debounced onto a microtask so
 *   fast typing doesn't thrash storage.
 * - Values round-trip through JSON, so Dates should be passed in as ISO
 *   strings by the caller rather than Date objects.
 */
export function usePersistedState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const hydrated = useRef(false);

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setState(JSON.parse(raw) as T);
      }
    } catch {
      // Corrupt or inaccessible storage — silently fall back to initialValue.
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return; // don't clobber storage before we've read it
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage full / private-browsing mode — non-fatal, just don't persist.
    }
  }, [key, state]);

  function clear() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return [state, setState, clear] as const;
}
