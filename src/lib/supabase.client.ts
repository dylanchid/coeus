import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for auth only. It shares the cookie-based
 * session with the server clients in supabase.server.ts (same `sb-*` cookies),
 * so a sign-in here is immediately visible to the authenticated /api/archive/*
 * routes. The publishable/anon key is public by design — RLS is the boundary.
 *
 * The two env references are written out literally so Next can inline them into
 * the client bundle; a computed `process.env[name]` would not be replaced.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return createBrowserClient(url, key);
}
