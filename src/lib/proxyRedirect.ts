/**
 * The optimistic auth redirects the Next proxy (src/proxy.ts) performs, lifted
 * out as a pure decision so they can be tested without a running server or a
 * Supabase session.
 *
 * The input is only the requested pathname and whether the JWT resolved to a
 * subject — never a database read. The real profile-completeness gate lives in
 * ProfileGate (client) and the authenticated API routes; this layer just keeps
 * a signed-out visitor off /welcome and bounces a signed-in one off /signin.
 */
export interface ProxyRedirect {
  /** Pathname to redirect to. The caller clears the existing query string first. */
  pathname: string;
  /** Query params to set on the target after the search string is cleared. */
  params?: Record<string, string>;
}

export function decideProxyRedirect(pathname: string, signedIn: boolean): ProxyRedirect | null {
  if (!signedIn && pathname === "/welcome") {
    return { pathname: "/signin", params: { next: "/welcome" } };
  }
  if (signedIn && pathname === "/signin") {
    return { pathname: "/welcome" };
  }
  return null;
}
