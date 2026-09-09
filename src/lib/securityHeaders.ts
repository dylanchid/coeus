type Header = { key: string; value: string };

function supabaseConnectSources(supabaseUrl: string | undefined): string[] {
  const sources = ["https://*.supabase.co", "wss://*.supabase.co"];
  if (!supabaseUrl) return sources;
  try {
    const origin = new URL(supabaseUrl);
    sources.push(origin.origin);
    sources.push(`${origin.protocol === "https:" ? "wss:" : "ws:"}//${origin.host}`);
  } catch {
    // An invalid public environment value will fail Supabase initialization too;
    // keep the security policy valid while that configuration error surfaces.
  }
  return [...new Set(sources)];
}

/**
 * An enforced CSP that permits the app's Next runtime plus its only browser
 * service, Supabase Auth/Storage. `unsafe-inline` is intentionally retained
 * for Next's inline bootstrap/style tags; script execution remains same-origin.
 */
/**
 * The only remote origin the app renders <img> from is the Supabase Storage
 * host (uploaded avatars/covers, pinned to that host in profile.ts). Narrowing
 * img-src from a blanket `https:` to that origin is defence-in-depth for F-25
 * and F-20 — a doctored profile URL at a third-party host will not load.
 */
function supabaseImgSources(supabaseUrl: string | undefined): string[] {
  const sources = ["https://*.supabase.co"];
  try {
    if (supabaseUrl) sources.push(new URL(supabaseUrl).origin);
  } catch {
    // Keep the policy valid while the misconfiguration surfaces elsewhere.
  }
  return [...new Set(sources)];
}

export function securityHeaders(production: boolean, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): Header[] {
  const connectSrc = ["'self'", ...supabaseConnectSources(supabaseUrl)].join(" ");
  const imgSrc = ["'self'", "data:", "blob:", ...supabaseImgSources(supabaseUrl)].join(" ");
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      "base-uri 'self'",
      `connect-src ${connectSrc}`,
      "font-src 'self' data:",
      "form-action 'self'",
      // Reader previews are sandboxed remote documents. RSS publishers are a
      // user-configurable, unbounded set, so an origin allowlist is not viable.
      "frame-src https:",
      "frame-ancestors 'none'",
      `img-src ${imgSrc}`,
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
    ].join("; ") },
    { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  // HSTS is meaningful only once requests are served via HTTPS. Avoid
  // includeSubDomains/preload commitments because the deployment does not own
  // every possible subdomain.
  if (production) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000" });
  return headers;
}
