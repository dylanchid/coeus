"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type ArchiveData, type ArchiveItem } from "@/lib/archive";
import { useArchive } from "./AppProviders";
import { PrimaryNav } from "./PrimaryNav";

function timeAgo(iso: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SocialApp() {
  const { archive: data, updateArchive } = useArchive();
  const [composerOpen, setComposerOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [commentary, setCommentary] = useState("");
  const [notice, setNotice] = useState("");
  const [following, setFollowing] = useState<Set<string>>(new Set(["open-web-notes"]));

  const itemById = useMemo(() => new Map((data?.items ?? []).map((item) => [item.id, item])), [data]);
  const communityCollections = data?.collections.filter((collection) => collection.kind === "community") ?? [];

  const publish = () => {
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
    updateArchive(() => next);
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
    } catch { /* user cancelled */ }
  };

  if (!data) return <p className="boot">Opening the social layer…</p>;

  return (
    <div className="social-page">
      <header className="archive-header">
        <div><Link className="archive-wordmark" href="/">Bareaga</Link><span className="archive-section-name">/ social</span></div>
        <PrimaryNav current="social" />
      </header>

      <section className="social-hero">
        <p className="archive-kicker">The web, passed hand to hand</p>
        <div><h1>Share the part<br />that mattered.</h1><p>Post a sourced passage, add what you see in it, or contribute it to a collection people build together.</p></div>
        <button type="button" onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? "Close" : "+ Share a link or clip"}</button>
      </section>

      {composerOpen ? (
        <section className="social-composer" aria-label="Share a link or clip">
          <div className="social-composer-head"><span>New sourced post</span><small>The original URL always travels with the clip.</small></div>
          <div className="social-composer-grid">
            <label><span>Website URL</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
            <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Page or article title" /></label>
            <label><span>Snippet or passage</span><textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="The exact part worth carrying into the conversation…" /></label>
            <label><span>Your perspective</span><textarea value={commentary} onChange={(event) => setCommentary(event.target.value)} placeholder="Why share this now?" /></label>
          </div>
          <div className="social-composer-actions"><span>Public · source attached · saved to your archive</span><button type="button" onClick={publish} disabled={!url.trim() || !excerpt.trim()}>Publish clip</button></div>
        </section>
      ) : null}
      {notice ? <p className="social-notice" role="status">{notice}</p> : null}

      <div className="social-layout">
        <main className="social-feed">
          <div className="social-feed-head"><h2>Following</h2><span>{data.socialPosts.length} sourced posts</span></div>
          {data.socialPosts.map((post) => {
            const item = itemById.get(post.itemId);
            if (!item) return null;
            return (
              <article className="social-post" key={post.id}>
                <header><div className="social-avatar" aria-hidden="true">{post.author.slice(0, 1)}</div><div><strong>{post.author}</strong><span>{timeAgo(post.createdAt)} · {post.audience}</span></div></header>
                {post.commentary ? <p className="social-commentary">{post.commentary}</p> : null}
                <blockquote>{post.excerpt}</blockquote>
                <a className="social-source-card" href={item.url} target="_blank" rel="noreferrer"><span>{item.sourceName}</span><strong>{item.title}</strong><small>{item.url}</small></a>
                <footer><button type="button" onClick={() => void sharePost(item, post.excerpt)}>Share ↗</button><button type="button" onClick={() => setNotice("Already saved with its source and context")}>Save</button><Link href="/archive">Open in archive</Link></footer>
              </article>
            );
          })}
        </main>

        <aside className="social-communities">
          <div><p>Community collections</p><span>Shared shelves turn scattered posts into durable paths.</span></div>
          {communityCollections.map((collection) => (
            <article key={collection.id}><span>◎ Community · {collection.visibility}</span><h3>{collection.name}</h3><p>{collection.description}</p><small>{data.items.filter((item) => item.collectionIds.includes(collection.id)).length} pieces · 3 curators</small><button type="button" aria-pressed={following.has(collection.id)} onClick={() => setFollowing((current) => { const next = new Set(current); if (next.has(collection.id)) next.delete(collection.id); else next.add(collection.id); return next; })}>{following.has(collection.id) ? "Following" : "+ Follow"}</button></article>
          ))}
          <p className="social-preview-note"><strong>Local preview.</strong> Posts and follows live on this device until account-backed sync and community permissions land.</p>
        </aside>
      </div>
    </div>
  );
}
