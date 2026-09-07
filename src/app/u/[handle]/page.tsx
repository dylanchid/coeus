import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { deriveProfileView } from "@/lib/publicProfile";
import { resolveProfileTab } from "@/lib/profileTabs";
import { loadProfileIdentity } from "@/lib/profilePageLoader.server";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { SupabasePostPublicationStore } from "@/lib/postPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import type { Viewer } from "@/lib/visibility";

export const dynamic = "force-dynamic";

/**
 * `loadProfileIdentity` is a request-scoped `cache()` shared with
 * `generateMetadata`, so the two passes cost one `resolveHandle` query between
 * them. The render body then issues one parallel batch for everything the view
 * needs: publications, posts, the person-follow counts, and — for a signed-in
 * non-owner — whether this viewer follows the profile (plan risk R5: resolved
 * once here, carried down as the Viewer).
 */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return { title: "Profile not found — Coeus" };
  const { profile } = resolution;
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
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) notFound();

  const { profile } = resolution;
  const viewerId = await authenticateArchiveRequest();
  const isOwner = viewerId !== null && viewerId === profile.id;

  const admin = createAdminSupabaseClient();
  const profileStore = new SupabaseProfileStore(admin);
  const followStore = new SupabaseProfileFollowStore(admin);
  const postReader = new SupabasePostPublicationStore(admin);

  const [publications, posts, followers, following, initialFollowing] = await Promise.all([
    profileStore.listOwnedPublications(profile.id),
    postReader.listByAuthor(profile.id),
    followStore.countFollowers(profile.id),
    followStore.countFollowing(profile.id),
    viewerId && !isOwner ? followStore.isFollowing(viewerId, profile.id) : Promise.resolve(false),
  ]);

  const viewer: Viewer = isOwner
    ? { kind: "owner", id: viewerId! }
    : initialFollowing
      ? { kind: "follower", id: viewerId! }
      : viewerId
        ? { kind: "signed-in", id: viewerId }
        : { kind: "anonymous" };

  const view = deriveProfileView(profile, publications, viewer, {
    posts,
    sections: profile.sections,
    followers,
    following,
  });
  const openEditor = isOwner && (query.edit === "1" || query.edit === "true");

  return (
    <AppShell section="account">
      <ProfileView
        view={view}
        tab={resolveProfileTab(query.tab)}
        follow={isOwner ? null : { profileId: profile.id, initialFollowing }}
        sectionSwitches={isOwner ? profile.sections : null}
        openEditor={openEditor}
      />
    </AppShell>
  );
}
