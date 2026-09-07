import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DiscoverApp } from "@/components/SocialApp";
import { DiscoverViewTabs } from "@/components/DiscoverViewTabs";
import { FollowingFeed } from "@/components/FollowingFeed";
import { SupabaseFollowedFeedReader } from "@/lib/followedFeed.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const metadata: Metadata = {
  title: "Discover — Coeus",
  description: "Explore collections, articles, and links shared by people across the open web.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function boundedOffset(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const view = (Array.isArray(query.view) ? query.view[0] : query.view) === "following" ? "following" : "everyone";

  // The Everyone view keeps its client-rendered local-archive feed; SocialApp
  // renders its own AppShell and the DiscoverViewTabs strip.
  if (view === "everyone") return <DiscoverApp />;

  const viewerId = await authenticateArchiveRequest();
  if (!viewerId) {
    return (
      <AppShell section="discover" subline="Content from the people you follow.">
        <div className="discover-page">
          <DiscoverViewTabs current="following" />
          <p className="discover-following-empty">
            <Link href={`/signin?next=${encodeURIComponent("/discover?view=following")}`}>Sign in</Link> to see
            collections and posts from the people you follow.
          </p>
        </div>
      </AppShell>
    );
  }

  const offset = boundedOffset(query.offset);
  const feed = await new SupabaseFollowedFeedReader(createAdminSupabaseClient()).listFollowedPeopleContent(
    viewerId,
    PAGE_SIZE,
    offset
  );

  return (
    <AppShell section="discover" subline="Content from the people you follow.">
      <div className="discover-page">
        <DiscoverViewTabs current="following" />
        <FollowingFeed items={feed.items} hasMore={feed.hasMore} offset={offset} pageSize={PAGE_SIZE} />
      </div>
    </AppShell>
  );
}
