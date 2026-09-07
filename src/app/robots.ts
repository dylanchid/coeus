import type { MetadataRoute } from "next";

const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Index public pages; authenticated, API, and legacy rewritten paths are not crawl targets. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/archive/", "/auth/", "/signin/", "/u/", "/welcome/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
