import assert from "node:assert/strict";
import test from "node:test";

import { securityHeaders } from "./securityHeaders.ts";

function asMap(headers) { return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value])); }

test("security headers enforce a same-origin CSP while allowing the configured Supabase origin", () => {
  const headers = asMap(securityHeaders(true, "https://project.supabase.co"));
  const csp = headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /frame-src https:/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co https:\/\/project\.supabase\.co wss:\/\/project\.supabase\.co/);
  assert.match(csp, /img-src 'self' data: blob: https:\/\/\*\.supabase\.co https:\/\/project\.supabase\.co/);
  assert.doesNotMatch(csp, /img-src[^;]*\bhttps:(?!\/\/)/);
  assert.equal(headers.get("strict-transport-security"), "max-age=63072000");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
});

test("HSTS is production-only and malformed Supabase config cannot invalidate CSP", () => {
  const headers = asMap(securityHeaders(false, "not a URL"));
  assert.equal(headers.has("strict-transport-security"), false);
  assert.match(headers.get("content-security-policy"), /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
});
