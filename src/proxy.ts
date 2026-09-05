import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 "proxy" (formerly middleware). Two jobs, both cheap:
 *
 *  1. Refresh the Supabase auth token on every navigation so Server Components
 *     and Route Handlers see a current session (the `@supabase/ssr` client can
 *     only re-issue the cookie from a context that can also write it).
 *  2. Optimistic redirects between /signin and /welcome based purely on whether
 *     a session cookie resolves — never a database read. The real
 *     profile-completeness gate lives client-side (ProfileGate) and in the
 *     authenticated API routes.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && path === "/welcome") {
    const to = request.nextUrl.clone();
    to.pathname = "/signin";
    to.search = "";
    to.searchParams.set("next", "/welcome");
    return NextResponse.redirect(to);
  }

  if (user && path === "/signin") {
    const to = request.nextUrl.clone();
    to.pathname = "/welcome";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return response;
}

export const config = {
  // Run on pages only: skip API routes (they authenticate themselves), Next
  // internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
