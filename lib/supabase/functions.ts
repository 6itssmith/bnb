// Supabase Edge Functions are invoked directly from the browser here rather
// than through a Next.js Route Handler, because this app builds as a static
// export (`output: "export"` in next.config.js) — there is no Next.js server
// at runtime to host `app/api/*` handlers. Edge Functions are the right home
// for anything that needs a secret key (Stripe, M-Pesa, PayPal, the Supabase
// service role): those secrets are set with `supabase secrets set` and never
// reach the browser bundle.
//
// The anon key is sent as the bearer token. Supabase Edge Functions verify
// it's a JWT signed for this project (the default `verify_jwt` behaviour)
// but it does not grant elevated access — the functions only ever act with
// the service-role key on the server side, scoped by the logic in each
// function body.

function functionsBaseUrl(): string {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  // https://<ref>.supabase.co  ->  https://<ref>.functions.supabase.co
  return projectUrl.replace(".supabase.co", ".functions.supabase.co");
}

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: unknown
): Promise<T> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  const res = await fetch(`${functionsBaseUrl()}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `${name} failed with ${res.status}`);
  }
  return data as T;
}
