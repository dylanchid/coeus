import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { NoPublicCollectionsYet, PublicCollectionList } from "@/components/PublicCollectionList";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: "Public collections — Coeus",
  description: "Browse collections people have published and made discoverable.",
};

function boundedOffset(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export default async function PublicCollectionsPage({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
  const { offset: offsetParam } = await searchParams;
  const offset = boundedOffset(offsetParam);
  const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
  const { items, hasMore } = await store.listPublic(PAGE_SIZE, offset);

  return (
    <AppShell section="archive" footerNote={<>Public, human-curated collections.</>}>
      <div className="public-collection-page">
        <header>
          <p className="archive-eyebrow">Discover</p>
          <h1>Public collections</h1>
          <p>Collections people have curated and made discoverable, with attribution and stable links.</p>
        </header>
        <PublicCollectionList
          items={items}
          hasMore={hasMore}
          offset={offset}
          pageSize={PAGE_SIZE}
          pageHref={(next) => `/c?offset=${next}`}
          empty={<NoPublicCollectionsYet />}
        />
      </div>
    </AppShell>
  );
}
