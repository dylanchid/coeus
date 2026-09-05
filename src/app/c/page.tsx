import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
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
        {items.length ? (
          <ol className="public-collection-list">
            {items.map((item) => (
              <li key={item.id}>
                <h2><Link href={`/c/${item.slug}`}>{item.name}</Link></h2>
                <p className="public-collection-meta">
                  {item.itemCount} {item.itemCount === 1 ? "piece" : "pieces"}
                  {item.attribution ? ` — ${item.attribution}` : ""}
                </p>
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="public-collection-empty">No public collections yet.</p>
        )}
        <nav className="public-collection-pagination" aria-label="Pagination">
          {offset > 0 ? <Link href={`/c?offset=${Math.max(offset - PAGE_SIZE, 0)}`}>← Newer</Link> : <span />}
          {hasMore ? <Link href={`/c?offset=${offset + PAGE_SIZE}`}>Older →</Link> : null}
        </nav>
      </div>
    </AppShell>
  );
}
