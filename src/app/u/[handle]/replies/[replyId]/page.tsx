import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileThread } from "@/components/ProfileThread";
import { loadThreadPage } from "@/lib/threadPageLoader.server";
import { loadProfileIdentity } from "@/lib/profilePageLoader.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return { title: "Thread not found — Coeus" };
  const { profile } = resolution;
  return {
    title: `A thread from ${profile.displayName} (@${profile.handle}) — Coeus`,
    description: `A reply thread on @${profile.handle}'s profile.`,
    alternates: { canonical: `/@${profile.handle}?tab=replies` },
    robots: { index: false, follow: true },
  };
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; replyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle, replyId } = await params;
  const cursor = (await searchParams).cursor;
  const data = await loadThreadPage(handle, replyId, cursor);
  if (!data) notFound();
  if (data.redirectFrom) permanentRedirect(`/@${data.profile.handle}/replies/${replyId}`);
  if (!data.view) notFound();

  return (
    <AppShell section="account">
      <ProfileThread
        handle={data.profile.handle}
        isOwner={data.isOwner}
        view={data.view}
        hasMore={data.hasMore}
        nextCursor={data.nextCursor}
        onCursor={data.onCursor}
      />
    </AppShell>
  );
}
