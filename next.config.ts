import type { NextConfig } from "next";
import path from "path";
import { securityHeaders } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Isolate from parent lockfiles in the home directory
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    // /@handle is the canonical public profile URL; /u/[handle] is the route
    // that renders it. A plain array applies at the afterFiles position, so
    // real files and static routes still win over /@something.
    //
    // The :section rule (followers / following) is listed first so it matches
    // before the bare-handle rule; path-to-regexp is greedy left to right.
    return [
      { source: "/@:handle/:section", destination: "/u/:handle/:section" },
      { source: "/@:handle", destination: "/u/:handle" },
    ];
  },
  async headers() {
    // Applies to HTML, APIs, auth callbacks, and public content alike. Route
    // handlers can still add their narrower cache/content-type headers.
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") }];
  },
};

export default nextConfig;
