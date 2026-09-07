import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
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
    title: `Accounts ${profile.displayName} (@${profile.handle}) follows — Coeus`,
    description: `Accounts @${profile.handle} follows on Coeus.`,
    alternates: { canonical: `/@${profile.handle}/following` },
    robots: { index: false, follow: true },
  };
}

export default async function FollowingPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const cursor = cursorParam((await searchParams).cursor);
  const data = await loadFollowList(handle, "following", cursor);
  if (!data) notFound();
  if (data.redirectFrom) permanentRedirect(`/@${data.profile.handle}/following`);

  return (
    <AppShell section="account">
      <ProfileFollowList
        handle={data.profile.handle}
        direction="following"
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
