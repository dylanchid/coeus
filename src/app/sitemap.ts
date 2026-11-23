import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/siteMetadata";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";

const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

/**
 * Static routes always ship. Published collections and their curators are
 * added when the database answers; any missing env or query error falls back
 * to the static list so `next build` still succeeds without Supabase.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
    return buildSitemap(origin, await store.listSitemapEntries());
  } catch {
    return buildSitemap(origin, []);
  }
}
