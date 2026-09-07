import type { MetadataRoute } from "next";

const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Public profiles/collections self-canonicalize but are not enumerated here, avoiding an unbounded database crawl. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/about", "/c", "/discover", "/product", "/social", "/sources"].map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
