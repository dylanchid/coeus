import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Isolate from parent lockfiles in the home directory
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
