import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { deriveProfileView } from "@/lib/publicProfile";
import { resolveProfileTab } from "@/lib/profileTabs";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/**
 * One fetch shared by generateMetadata and the page body (the /c/[slug]
 * pattern). resolveHandle() is the ONLY handle lookup in the codebase — see
 * profileStore.server.ts. A thrown error here (a Supabase outage) is left to
 * Next's error boundary; only a genuinely missing handle returns null and
 * reads as 404.
 *
 * Two round-trips: resolveHandle (one query) + listOwnedPublications (one
 * query, owner_id-indexed, item/follower counts embedded).
 */
const loadProfile = cache(async (handle: string) => {
  const store = new SupabaseProfileStore(createAdminSupabaseClient());
  const resolution = await store.resolveHandle(handle);
  if (!resolution) return null;
  const publications = await store.listOwnedPublications(resolution.profile.id);
  return { resolution, publications };
});

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const loaded = await loadProfile(handle);
  if (!loaded) return { title: "Profile not found — Coeus" };
  const { profile } = loaded.resolution;
  return {
    title: `${profile.displayName} (@${profile.handle}) — Coeus`,
    description: profile.bio ?? undefined,
  };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const query = await searchParams;
  const loaded = await loadProfile(handle);
  if (!loaded) notFound();

  const viewerId = await authenticateArchiveRequest();
  const { profile } = loaded.resolution;
  // isOwner is true only when the session subject equals the profile id.
  const isOwner = viewerId !== null && viewerId === profile.id;

  const view = deriveProfileView(profile, loaded.publications, { isOwner });
  const openEditor = isOwner && (query.edit === "1" || query.edit === "true");

  return (
    <AppShell section="account">
      <ProfileView view={view} tab={resolveProfileTab(query.tab)} openEditor={openEditor} />
    </AppShell>
  );
}
