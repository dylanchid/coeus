import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW } from "@/lib/siteMetadata";

const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Index public pages; authenticated, API, and private surfaces are not crawl targets. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
