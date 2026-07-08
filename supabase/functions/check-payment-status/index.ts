// check-payment-status
//
// Anon has no SELECT policy on `payments` (by design, per the RLS in
// 001_init.sql), so the browser has no way to see whether an M-Pesa STK
// push was actually confirmed. This function is the narrow, read-only
// exception: given a bookingId, it returns just the latest payment status
// for that booking via the service role, nothing else.
//
// Polled from components/PaymentOptions.tsx while an M-Pesa STK push is
// awaiting the guest's PIN entry on their phone.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let bookingId: string | undefined;
  let provider: string | undefined;
  try {
    ({ bookingId, provider } = await req.json());
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!bookingId) return json({ error: "bookingId is required" }, 400);

  let query = supabase
    .from("payments")
    .select("status, provider, provider_ref")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (provider) query = query.eq("provider", provider);

  const { data, error } = await query.maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ status: "not_found" });

  return json({ status: data.status, provider: data.provider, providerRef: data.provider_ref });
});
