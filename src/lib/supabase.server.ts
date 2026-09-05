import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function requiredEnvironment(name: string, fallback?: string): string {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

export async function createRequestSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
}

export function createAdminSupabaseClient(): SupabaseClient {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

export async function authenticateArchiveRequest(): Promise<string | null> {
  const supabase = await createRequestSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return typeof data?.claims.sub === "string" ? data.claims.sub : null;
}
