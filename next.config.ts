import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Isolate from parent lockfiles in the home directory
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    // /@handle is the canonical public profile URL; /u/[handle] is the route
    // that renders it. A plain array applies at the afterFiles position, so
    // real files and static routes still win over /@something.
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
};

export default nextConfig;
