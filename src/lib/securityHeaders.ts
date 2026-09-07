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
export function securityHeaders(production: boolean, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): Header[] {
  const connectSrc = ["'self'", ...supabaseConnectSources(supabaseUrl)].join(" ");
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      "base-uri 'self'",
      `connect-src ${connectSrc}`,
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
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
