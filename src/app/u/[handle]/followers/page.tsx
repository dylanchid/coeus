import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileFollowList } from "@/components/ProfileFollowList";
import { loadFollowList } from "@/lib/followListPage.server";
import { loadProfileIdentity } from "@/lib/profilePageLoader.server";

export const dynamic = "force-dynamic";

function cursorParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length ? value : null;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return { title: "Profile not found — Coeus" };
  const { profile } = resolution;
  return {
    title: `People following ${profile.displayName} (@${profile.handle}) — Coeus`,
    description: `Accounts that follow @${profile.handle} on Coeus.`,
  };
}

export default async function FollowersPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const cursor = cursorParam((await searchParams).cursor);
  const data = await loadFollowList(handle, "followers", cursor);
  if (!data) notFound();

  return (
    <AppShell section="account">
      <ProfileFollowList
        handle={data.profile.handle}
        direction="followers"
        isOwner={data.isOwner}
        hiddenFromProfile={data.hiddenFromProfile}
        count={data.count}
        items={data.page.items}
        hasMore={data.page.hasMore}
        nextCursor={data.page.nextCursor}
        onCursor={cursor !== null}
      />
    </AppShell>
  );
}
