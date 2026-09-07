"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type ArchiveData, type ArchiveItem } from "@/lib/archive";
import { isShareCancellation } from "@/lib/shareDestination";
import { useArchive } from "./AppProviders";
import { AppShell } from "./AppShell";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { AlreadyArchivedButton, PreviewFollowButton } from "./DiscoverPreviewControls";
import { DiscoverViewTabs } from "./DiscoverViewTabs";

function timeAgo(iso: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function DiscoverApp() {
  const { archive: data, updateArchive } = useArchive();
  const [composerOpen, setComposerOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [commentary, setCommentary] = useState("");
  const [notice, setNotice] = useState("");
  const [publishing, setPublishing] = useState(false);

  const itemById = useMemo(() => new Map((data?.items ?? []).map((item) => [item.id, item])), [data]);
  const communityCollections = data?.collections.filter((collection) => collection.kind === "community") ?? [];

  const publish = async () => {
    if (!data || !url.trim() || !excerpt.trim()) return;
    let parsed: URL;
    try { parsed = new URL(url.trim()); } catch { setNotice("Enter a complete URL, including https://"); return; }
    const itemId = `shared-${Date.now()}`;
    const item: ArchiveItem = {
      id: itemId,
      articleId: itemId,
      title: title.trim() || parsed.hostname,
      url: parsed.toString(),
      sourceName: parsed.hostname.replace(/^www\./, ""),
      topic: "shared",
      summary: excerpt.trim(),
      author: "",
      publishedAt: null,
      savedAt: new Date().toISOString(),
      state: "kept",
      starred: false,
      collectionIds: [],
      tags: [],
      note: commentary.trim(),
    };
    const next: ArchiveData = {
      ...data,
      items: [item, ...data.items],
      socialPosts: [{ id: `post-${Date.now()}`, itemId, excerpt: excerpt.trim(), commentary: commentary.trim(), audience: "public", createdAt: new Date().toISOString(), author: "You" }, ...data.socialPosts],
    };
    setPublishing(true);
    const saved = await updateArchive(() => next);
    setPublishing(false);
    if (!saved) {
      setNotice("Publishing failed because the archive could not be saved. Retry before leaving this page.");
      return;
    }
    setUrl(""); setTitle(""); setExcerpt(""); setCommentary(""); setComposerOpen(false);
    setNotice("Published with its source attached");
  };

  const sharePost = async (item: ArchiveItem, excerptText: string) => {
    const text = `${excerptText}\n\n${item.title}`;
    const canNativeShare = typeof navigator.share === "function";
    try {
      if (canNativeShare) await navigator.share({ title: item.title, text, url: item.url });
      else await navigator.clipboard.writeText(`${text}\n${item.url}`);
      setNotice(canNativeShare ? "Opened your share sheet" : "Post copied");
    } catch (shareError) {
      if (!isShareCancellation(shareError)) {
        setNotice("Sharing failed. Check clipboard permissions and try again.");
      }
    }
  };

  if (!data) return <p className="boot">Opening Discover…</p>;

  return (
    <AppShell
      section="discover"
      subline="Collections, articles, and links shared by people—not ranked by an engagement algorithm."
    >
      <div className="social-page">
      <DiscoverViewTabs current="everyone" />
      {composerOpen ? (
        <section className="social-composer" aria-label="Share a link or clip">
          <div className="social-composer-head"><span>New sourced post</span><small>The original URL always travels with the clip.</small></div>
          <div className="social-composer-grid">
            <label><span>Website URL</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
            <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Page or article title" /></label>
            <label><span>Snippet or passage</span><textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="The exact part worth carrying into the conversation…" /></label>
            <label><span>Your perspective</span><textarea value={commentary} onChange={(event) => setCommentary(event.target.value)} placeholder="Why share this now?" /></label>
          </div>
          <div className="social-composer-actions"><span>Public · source attached · saved to your archive</span><button type="button" onClick={() => void publish()} disabled={publishing || !url.trim() || !excerpt.trim()}>{publishing ? "Saving…" : "Publish clip"}</button></div>
        </section>
      ) : null}
      {notice ? <p className="social-notice" role="status">{notice}</p> : null}

      <div className="social-layout">
        <section className="social-feed" aria-labelledby="social-feed-title">
          <div className="social-feed-head">
            <h2 id="social-feed-title">Shared by people and collections</h2>
            <div className="social-feed-actions">
              <span>{data.socialPosts.length} shared links</span>
              <button
                type="button"
                className="btn btn--solid"
                onClick={() => setComposerOpen((open) => !open)}
              >
                {composerOpen ? "Close" : "+ Share a link or clip"}
              </button>
            </div>
          </div>
          {data.socialPosts.map((post) => {
            const item = itemById.get(post.itemId);
            if (!item) return null;
            return (
              <article className="social-post" key={post.id}>
                <header><div className="social-avatar" aria-hidden="true">{post.author.slice(0, 1)}</div><div><strong>{post.author}</strong><span>{timeAgo(post.createdAt)} · {post.audience}</span></div></header>
                {post.commentary ? <p className="social-commentary">{post.commentary}</p> : null}
                <blockquote>{post.excerpt}</blockquote>
                <a className="social-source-card" href={item.url} target="_blank" rel="noreferrer"><span>{item.sourceName}</span><strong>{item.title}</strong><small>{item.url}</small><ExternalLinkHint /></a>
                <footer><button type="button" onClick={() => void sharePost(item, post.excerpt)}>Share ↗</button><AlreadyArchivedButton /><Link href="/archive">Open in archive</Link></footer>
              </article>
            );
          })}
        </section>

        <aside className="social-communities">
          <div><p>Collections to follow</p><span>Shared shelves turn scattered links into durable paths.</span></div>
          {communityCollections.map((collection) => (
            <article key={collection.id}><span>◎ Community · {collection.visibility}</span><h3>{collection.name}</h3><p>{collection.description}</p><small>{data.items.filter((item) => item.collectionIds.includes(collection.id)).length} pieces · 3 curators</small><PreviewFollowButton initialPreviewing={collection.id === "open-web-notes"} /></article>
          ))}
          <p className="social-preview-note"><strong>Everyone view.</strong> This feed is a local preview and isn&rsquo;t filtered by who you follow. The <Link href="/discover?view=following">Following</Link> view shows content from people you follow, account-backed.</p>
        </aside>
      </div>
      </div>
    </AppShell>
  );
}
