# Coeus — Product Requirements Document

**Status:** Living document, reflects the codebase as of 2026-09-04
**Owner:** Dylan Chidambaram
**Related:** [`HANDOFF.md`](../HANDOFF.md) (engineering entry point), `/about` route (public-facing explanation), `coeus_web-5bv` (shared-collections roadmap issue)

---

## 1. One-line pitch

Coeus is a personal front page for the open web: you choose RSS/Atom sources, Coeus merges them into one deliberate reading surface, and every "smart" feature — ranking, filtering, organizing — is a transparent tool you control rather than a black box that controls you.

## 2. Problem statement

Reading the open web today means either:

- opening a dozen individual sites/apps and reassembling them yourself, or
- ceding the assembly to a platform algorithm that optimizes for engagement, not for what you actually asked for.

Coeus's bet is that there's a third option: let the user do the curating (which sources, in what order, with what weight) and let the software do the mechanical work (fetching, normalizing, deduplicating failure, remembering preferences) — with any ranking logic fully inspectable.

## 3. Product principles

These are stated explicitly in the product itself (`/about` route) and should constrain every feature decision:

1. **Sources over algorithms** — the one ranking feature that exists is user-authored and shows its work.
2. **Finite pages over endless feeds** — reading sessions have a bottom, not an infinite scroll.
3. **Useful controls over decorative chrome** — every setting does something; nothing is aesthetic-only.
4. **Open formats over locked platforms** — your data (preferences, archive) is exportable JSON/Markdown/CSV at all times, with no account required to use any of it.

## 4. Core object model

Everything else is built from two objects:

- **Source** — a publication (Hacker News, The Verge, etc.), tagged with a broad `topic` (tech/news/business/science), a richer discovery `topics[]`/`tags[]`, `language`, `region`, `sourceType` (publisher / community / primary-source / research), `cadence` (live/daily/weekly), and `depth` (brief/mixed/deep).
- **Article** — title, summary, author, published date, source, and optional engagement stats (points/comments), normalized into one shape regardless of source feed format.

Every surface in the product manipulates this same source/article vocabulary rather than inventing new concepts — Sources finds publications, Reader consumes their articles, Archive keeps articles, and Discover re-shares them with attribution intact.

## 5. Users

Single persona today: a self-directed reader who wants broad, source-diverse coverage without an algorithmic feed and without an account. The product currently assumes:

- one person, one browser, no login;
- comfort with lightweight power-user mechanics (keyboard shortcuts, a command palette, keyword-rule syntax);
- a preference for transparency/control over "it just works" automation.

## 6. Surfaces

### 6.1 Reader (`/`) — the daily surface

The default view. Loads articles from the user's enabled sources (server-side fetch via `/api/feeds`, avoiding browser CORS issues) and renders them in one of four switchable views (`prefs.homeView`), persisted per user:

| View | Behavior |
|---|---|
| **Grid** | Sources as columns (the "newsstand" layout), 1–4 columns, each showing its own headlines independently. |
| **Top** | Same story pool, round-robin balanced across sources/topics so no single prolific source dominates. |
| **Focus** | Pure reverse-chronological across every enabled source, newest first. |
| **Ranked** | The personalization engine — see 6.1.1. |

**Discovery/control layer**, available on top of any view:

- Full-text search across every loaded headline and summary, with live match counts ("N shown across M sources").
- Topic filter bar — currently a 5-value broad taxonomy: `all / tech / news / business / science`.
- Slash command palette (`/` or `⌘K`/`Ctrl+K`) — fuzzy-searchable, grouped into **Actions, Topics, Display, Look, Feed, Sources, Articles**. Covers jumping to a topic, toggling display settings, changing columns/theme/font, and reordering sources without the mouse.
- Keyboard shortcuts: `⌘K`/`Ctrl+K` toggles the palette (works even mid-typing); `/` opens it (suppressed while a text field has focus); `,` toggles Settings; `r`/`R` refreshes feeds; `?` focuses/selects the search box (not a help overlay).
- Drag-to-reorder source columns (`@dnd-kit`), persisted to preferences.
- **Per-source failure isolation**: if one publisher's feed fails, that source shows an inline error with retry while every other source keeps working. This is treated as a UX guarantee, not an incidental backend behavior.
- **Save** and **Share** actions live on every story card (see 6.5, ShareSheet).

#### 6.1.1 Ranked view — the personalization engine

Not a black box: a transparent, user-authored scoring system (`src/lib/ranking.ts`). Every point on every story is explainable via a `reasons: { label, points }[]` list rendered on the card.

- **Keyword rules**, written as literal text, e.g. `AI +5`, `"local-first" +8`, `crypto -4`, `@hn Rust +3` (source-scoped via `@sourceId`). Per-rule weight is clamped to **[-10, +10]**; up to 100 rules are kept.
  - A title match scores **4×** the rule weight; a summary-only match scores **2×**.
  - Total keyword contribution per story is clamped to **[-45, +45]**, with a `"keyword cap"` reason shown if the raw sum was clamped.
- **Per-source weight**, a **0.5×–1.5×** slider per source (1.0 = neutral), converted to points as `round((weight − 1) × 40)` (≈ -20 to +20), shown as a `"<Source> preference"` reason.
- **Recency decay**, exponential (not a hard cutoff): `round(20 × 2^(−ageHours / 24))` — up to 20 points at publish time, halving every 24 hours.
- **Engagement signal**, log-scaled (`log1p(points) + 1.25 × log1p(comments)`), normalized against the *current batch's* per-source maximum so a source with structurally larger numbers doesn't always win, scaled to a max of 10 points.
- **Diversity penalty**, applied during a greedy selection pass rather than a pre-sort: −5 if the immediately-previous chosen story shares a source, −2 if it shares a topic, plus up to −6 more if the source appeared anywhere in the last 5 chosen stories — actively breaking up runs of one source or topic.

★ Insight ─────────────────────────────────────
The diversity penalty is applied *during* selection (a greedy loop that picks the best-remaining story at each position, `rankStories` in `ranking.ts`), not as a static score baked in beforehand. That's a meaningful design choice: a story's final score is context-dependent on what was already picked before it, which is why the same story can appear with a `"diversity −5"` reason in one render and without it in another — the penalty reflects its neighbors, not an intrinsic property of the story itself.
─────────────────────────────────────────────────

### 6.2 Sources (`/sources`) — the source catalog

A directory of all **51 catalog sources**, independent from "sources you've added" (22 are enabled by default for new users). Features:

- Search across name, description, region, language, topics, tags.
- A curated category rail of **29 categories** (AI, security, world, climate, philosophy, primary sources, etc.) plus structured filters for language, region, source type, and cadence.
- Six sort modes: **Featured** (editorial `defaultRank`), **Your rating**, **Freshest** (cadence-based), **Deepest** (depth-based), **Undiscovered** (surfaces sources not yet added), **A–Z**.
- Personal **1–5 star ratings** per source, explicitly private and separate from the editorial `defaultRank` — "Ratings are yours alone · Directory ranks are editorial."
- One-click add/remove that writes directly into reader preferences: adding pushes the source into `prefs.sourceOrder`; removing drops it from `sourceOrder` entirely (distinct from the separate `hiddenSources` hide-without-removing mechanism available in Settings → Sources). Sources and Reader Settings are two views onto the same underlying source list.

### 6.3 Archive (`/archive`) — the keep layer

The most functionally complete surface today. Per saved item: reading `state` (`unread / read / kept`), `starred`, a private `note`, `tags[]`, and `collectionIds[]`.

- Sidebar: "Everything" plus user-created collections, each with a `kind` (`personal / community`) and `visibility` (`private / unlisted / public`) — the data model already supports shared/public collections; only *serving* them publicly is unbuilt (tracked in `coeus_web-5bv`).
- Full-text search across title/summary/source/author/topic/note, with filter tabs (All/Unread/Starred/Annotated).
- Per-item actions: change state, star, copy as Markdown, reassign collection, inline note editor.
- **Export as a first-class feature**: whole-archive or per-collection export to Markdown (YAML frontmatter, aimed at Obsidian) or CSV (aimed at Notion/spreadsheets) — the concrete expression of "open formats over locked platforms."
- Footer states the current honesty boundary directly: "Private by default. Your archive lives on this device today. Shared collections are the next layer."

### 6.4 Discover (`/discover`) — shared links and collections

The people-powered surface for collections, shared articles, and links with human context attached. It explicitly states its current boundary: shared items and follows live on this device until account-backed sync and community permissions land.

What exists today:

- A composer publishing a **"sourced clip"**: URL + title + excerpt + user commentary. Publishing simultaneously creates an `ArchiveItem` (state `kept`) and a `SocialPost` — the excerpt is a hard product rule, never detached from its canonical source link.
- A feed of the user's own posts (`data.socialPosts` is local; there is no real multi-user network yet).
- "Community collections" browsing with a follow/unfollow toggle — currently **component-local state only, not persisted** (resets on reload; this is a known gap, not a hidden feature).
- Native share integration (`navigator.share()`, falling back to clipboard) so a post can leave Coeus entirely.

### 6.5 ShareSheet — the connective tissue

A single sheet, reachable from "Share" on any story card, offering five destinations as siblings rather than two separate flows:

1. **Discover**
2. **A friend** (native OS share sheet, or clipboard-copy fallback)
3. **Personal collection**
4. **Public collection**
5. **Community collection**

This is the one place in the product where "save privately" and "publish publicly" sit side by side as equal choices — evidence that collections/social sharing were designed as one spectrum from day one, even though only the private end (personal collections, local archive) is fully wired to real persistence today.

### 6.6 Settings

Tabs: **Reading / Appearance / Sources / Advanced** (`SETTINGS_TABS`). Ranking (keyword rules + source weights) and Data (export/import) are sections *inside* Advanced, not separate top-level tabs.

- **Reading**: density (`comfortable / compact`), which fields show (summaries, authors, ages, engagement counts).
- **Appearance**: theme (`system / light / dark`) × 5 palettes (**ink, paper, terminal, copper, rose**) × 4 fonts (**mono, sans, serif, slab**).
- **Sources**: per-source visibility (`hiddenSources`) and ordering, independent of the Sources directory's add/remove.
- **Advanced**: feed window — result limit (`5/10/15/25/50`, default 10) and lookback (`1/3/6/12/24/48/72` hours, default 24) — plus the ranking rules editor and preferences export/import as portable JSON (`coeus-prefs.json`, versioned, full-replace on import).

## 7. Current state vs. roadmap

**Fully real and usable solo today:** reading (all four views), ranking, source discovery, archiving, notes/collections, Markdown/CSV export, full preference portability — all local-first, no account.

**Scaffolded but explicitly labeled incomplete:** Discover's sharing layer. The data model (collection visibility, sourced-clip posts, follow relationships, the five-destination ShareSheet) is built; what's missing is account-backed sync so a public/unlisted collection or a follow actually persists and is visible to anyone but the local browser.

Stated near-term roadmap (from `/about` and project planning):

| Horizon | Item |
|---|---|
| Now | Bring-your-own-feeds — add any RSS/Atom URL into the existing source manager/ordering/topic system. |
| Next | Optional accounts + cloud-synced preferences, with local-first reading remaining the default. |
| Next | Reading state refinements — mark read, collapse a source, return to a quieter view — without becoming an inbox. |
| Later | Saved keyword watches / lightweight alerts, kept transparent and controllable rather than push-notification noise. |

Tracked separately in Beads: `coeus_web-5bv` — publish/discover shared collection paths (stable public URLs, curator notes, attribution, RSS output, privacy controls; eventually feeding a human-curated Discover layer).

## 8. Explicit non-goals (current)

- No recommendation/engagement-optimizing algorithm — the Ranked view's scoring is user-authored by design, not a placeholder for a future ML model.
- No infinite scroll / endless feed — views are bounded by the feed window setting.
- No required account to use any feature described in §6.1–6.3.
- No hidden telemetry-driven personalization — every ranking input is a setting the user set themselves.

## 9. Open questions and decisions

Account-backed sync is optional and reversible. Anonymous local-first use remains
the default; signing in adds a durable remote archive but does not remove the local
copy. The accepted storage and conflict model is documented in
[`synced-archive-architecture.md`](./synced-archive-architecture.md).

- How does `coeus_web-5bv`'s "community permissions" model interact with the existing private/unlisted/public visibility enum — is a fourth state needed, or do permissions layer on top of `public`?
- Discover's follow state is currently unpersisted local component state — is that a placeholder pending sync, or does it need a real (even if local) persistence layer before sync lands?

---

*This document should be updated alongside significant feature or roadmap changes. Technical implementation details (file paths, architecture) live in [`HANDOFF.md`](../HANDOFF.md); this document covers product surface and rationale.*
