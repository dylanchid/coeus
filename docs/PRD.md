# Coeus — Product Requirements Document

**Status:** Living document (product intent), reconciled with the codebase 2026-11-11. Scope decisions from the [2026-11 product review](./product-review-2026-11.md) are recorded in §7.1 and win over older roadmap text.
For the authoritative *engineering* status of what is built, see [`HANDOFF.md`](../HANDOFF.md).
**Owner:** Dylan Chidambaram
**Related:** [`HANDOFF.md`](../HANDOFF.md) (authoritative engineering status), `/about` route (public-facing explanation), `bareaga_web-5bv` (shared collections — shipped 2026-09-04)

**UX implementation companion:** [`docs/ux/`](./ux/README.md) contains the information architecture, screen-by-screen acceptance contract, user-flow research/test plan, and product-requirements traceability map. It distinguishes live behavior from proposed UX work; this PRD remains the source of product intent.

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

Single persona today: a self-directed reader who wants broad, source-diverse coverage without an algorithmic feed. An account is **optional** — every reading, ranking, and archive feature works with no login. The product currently assumes:

- one person per browser; an optional passwordless account adds cross-device archive sync, a public profile, and shareable collections without changing the local-first default;
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
- **Publisher-respecting source previews**: Coeus may show a bounded, static preview of
  the top of a linked page when interactive embedding is unavailable, subject to the
  policy in §6.1.2. This is a navigation aid, not a substitute for reading the source.

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

#### 6.1.2 Source preview policy — static fallback for non-embeddable pages

**Decision (2026-09-10):** When a publisher blocks or cannot confirm an interactive
iframe preview, Coeus shows a publisher metadata card and, where extraction is
permitted, a Defuddle-derived reader excerpt. Defuddle was selected over Mozilla
Readability after the shared benchmark because it extracted more eligible pages and
returned richer publisher metadata. This is a publisher-respecting navigation aid,
not a mechanism for circumventing embedding controls.

The reader excerpt must be non-interactive, visibly labeled **Reader view**, capped at
450 words on whole content blocks, and always retain a prominent direct link to the
original source. It must not hide the source, present Coeus as the publisher, reproduce
the article in full, or make the preview usable as a replacement reading surface. If
an excerpt cannot safely or permissibly be shown, the product falls back to the normal
metadata card (title, description, favicon/domain, and original link).

**Publisher controls and eligibility.** Before returning an excerpt or metadata card,
Coeus must:

- respect `robots.txt` directives applicable to its declared preview user agent;
- honor an explicit site instruction or a Coeus-maintained domain opt-out/denylist;
- offer a simple public opt-out/removal route that a publisher can use without creating
  an account, and apply verified requests promptly;
- not generate previews for pages behind authentication, paywalls or access controls,
  age gates, personalized sessions, sensitive categories, or other pages that cannot
  be fetched as an ordinary anonymous visitor; and
- preserve enough policy/audit information to remove cached previews by domain or URL.

The implementation must also follow source terms where applicable. A bounded,
source-attributed excerpt is a more defensible posture than copying a page, but it is
not a blanket license or legal conclusion. The product owner should obtain legal review
before broad public rollout, particularly in jurisdictions beyond the United States.

**Safety and operating constraints.** Extraction occurs only in an isolated,
unauthenticated server-side environment. It sends no user cookies or credentials,
does not execute as the user, blocks private/internal network targets and unsafe
redirects, is rate-limited, and has tight time/size limits. Excerpts are cached in a
private Vercel Blob store for one hour under a hostname folder and hashed URL key;
verified domain removals purge that domain and its hostname subfolders. The service must use the existing hardened
outbound-fetch controls rather than create a separate unprotected network path.

**Implementation note (2026-09-10) — metadata card and reader fallback.** The
fallback for a blocked or unknown embed first attempts the Defuddle reader excerpt,
then a publisher metadata card: `og:`/`twitter:` title, description, image, and favicon
parsed from the same HTML the policy path already fetches through the hardened outbound
controls. No headless browser is involved.
The card image and favicon are streamed back through a same-origin route
(`/api/article-preview/image`) rather than hotlinked: this keeps `img-src` at
`'self'` (no per-publisher CSP surface), avoids leaking the reader's IP/referer to
the publisher's asset host, and routes every hop through `validatedHttpsUrl` with a
2 MB cap and an `image/*` (non-SVG) content-type check. A richer in-Coeus reader
view is tracked separately (epic `bareaga_web-0bs`).

**Acceptance criteria for the feature.** The Reader should attempt the usual preview
only when permitted. For blocked or unknown links, it should show the reader excerpt
only when policy permits it; otherwise it should show metadata-only with “Open original.”
Users must be able to distinguish the excerpt from a live page, and publishers must
have a documented, low-friction way to stop future excerpts. Tests must cover the policy
decision paths, opt-out behavior, robots handling, redirect/SSRF protections, reader
fallback, and metadata-only fallback.

### 6.2 Sources (`/sources`) — the source catalog

A directory of all **51 catalog sources**, independent from "sources you've added" (22 are enabled by default for new users). Features:

- Search across name, description, region, language, topics, tags.
- A curated category rail of **29 categories** (AI, security, world, climate, philosophy, primary sources, etc.) plus structured filters for language, region, source type, and cadence.
- Six sort modes: **Featured** (editorial `defaultRank`), **Your rating**, **Freshest** (cadence-based), **Deepest** (depth-based), **Undiscovered** (surfaces sources not yet added), **A–Z**.
- Personal **1–5 star ratings** per source, explicitly private and separate from the editorial `defaultRank` — "Ratings are yours alone · Directory ranks are editorial."
- One-click add/remove that writes directly into reader preferences: adding pushes the source into `prefs.sourceOrder`; removing drops it from `sourceOrder` entirely (distinct from the separate `hiddenSources` hide-without-removing mechanism available in Settings → Sources). Sources and Reader Settings are two views onto the same underlying source list.

### 6.3 Archive (`/archive`) — the keep layer

The most functionally complete surface today. Per saved item: reading `state` (`unread / read / kept`), `starred`, a private `note`, `tags[]`, and `collectionIds[]`.

- Sidebar: "Everything" plus user-created collections, each with a `visibility` (`private / followers / unlisted / public`). New collections are always `personal`; the `community` kind exists in data but is frozen (§7.1). Publishing a collection to a stable public page at `/c/[slug]` (curator note, attribution, RSS output, follow/unfollow, curator byline) shipped in `bareaga_web-5bv` and #36; published collections are listed on Discover.
- Full-text search across title/summary/source/author/topic/note, with filter tabs (All/Unread/Starred/Annotated).
- Per-item actions: change state, star, copy as Markdown, reassign collection, inline note editor.
- **Export as a first-class feature**: whole-archive or per-collection export to Markdown (YAML frontmatter, aimed at Obsidian) or CSV (aimed at Notion/spreadsheets) — the concrete expression of "open formats over locked platforms."
- Footer states the honesty boundary directly: "Private by default. Your archive lives on this device, and syncs when you sign in. Nothing is public until you publish a collection."
- New visitors start with an empty archive (one Inbox) and a first-run empty state; there is no demo content.

### 6.4 Discover (`/discover`) — published collections

The people-powered surface, built only from what someone actually published:

- **Everyone** — every public collection, newest first, from the same store as `/c` (shared `PublicCollectionList`). When nothing is published, it says so and explains how a collection is made (save → collect → publish).
- **Following** — collections and posts from people the signed-in viewer follows, filtered through `canSee`.
- No invented activity, ever: the earlier device-local preview (seeded posts by fictional people, a local "publish clip" composer) was removed in #35.

### 6.5 ShareSheet — save, collect, or send

Reachable from "Share" on any story card, with three destinations:

1. **A friend** — native OS share sheet, or clipboard-copy fallback. Nothing is posted publicly.
2. **Personal collection** (default) — private or unlisted, just yours.
3. **Public collection** — a collection people can follow once it is published from the Archive.

"Discover" (sourced posts) and "Community collection" were removed as destinations when posts were folded into collections and community collections were frozen (§7.1).

### 6.6 Settings

Tabs: **Reading / Appearance / Sources / Advanced** (`SETTINGS_TABS`). Ranking (keyword rules + source weights) and Data (export/import) are sections *inside* Advanced, not separate top-level tabs.

- **Reading**: density (`comfortable / compact`), which fields show (summaries, authors, ages, engagement counts).
- **Appearance**: theme (`system / light / dark`) × 5 palettes (**ink, paper, terminal, copper, rose**) × 4 fonts (**mono, sans, serif, slab**).
- **Sources**: per-source visibility (`hiddenSources`) and ordering, independent of the Sources directory's add/remove.
- **Advanced**: feed window — result limit (`5/10/15/25/50`, default 10) and lookback (`1/3/6/12/24/48/72` hours, default 24) — plus the ranking rules editor and preferences export/import as portable JSON (`coeus-prefs.json`, versioned, full-replace on import).

## 7. Current state vs. roadmap

**Fully real and usable solo today:** reading (all four views), ranking, source discovery, archiving, notes/collections, Markdown/CSV export, full preference portability — all local-first, no account.

**Shipped for signed-in accounts:** passwordless accounts; cross-device archive sync (`bareaga_web-6j1`); published collections at `/c/[slug]` with RSS, follows, and a "Curated by @handle" byline (`bareaga_web-5bv`, #36); public profiles at `/@handle` (`bareaga_web-nfq`); in-app notifications; push destinations to Notion and Obsidian-via-GitHub (see §7.1, frozen at their current shape).

### 7.1 Scope decisions (accepted 2026-11-10)

From the [2026-11 product review](./product-review-2026-11.md). The core, stated once:

> **Coeus turns the sources you choose into one finite page, and turns what you keep into collections other people can follow — in Coeus or in any RSS reader.**

Every surface earns its place by feeding that sentence. **Frozen** means the code stays and keeps working for existing data, but it is hidden from navigation and gets no new work; revisit only when real users ask.

| Decision | Surface | Notes |
|---|---|---|
| **Keep and sharpen** | Reader, Sources (+ custom feeds), Archive (+ export), published collections with RSS, `/@handle` as the page of a person's collections | The core loop. |
| **Fold** | Posts → collection entries with a note | No new post surfaces. The per-item "Publish as post" panel is hidden; existing post rows and `/api/posts` remain. |
| **Fold** | Person follow → "follow everything @x publishes" | One follow concept that will feed the Reader (`ek7.2`). |
| **Freeze** | Likes, reposts, replies, notifications inbox, `/messages`, `/plus`, community collections | Notifications show only for signed-in accounts; `/messages` and `/plus` are unlinked stubs; the new-collection form no longer offers "Community"; profile tabs for these appear only when they already have content. |
| **Freeze** | Destination delivery queue (`DESTINATION_QUEUE_ENABLED`, `bareaga_web-9hz.8`) | Notion / Obsidian-via-GitHub delivery keeps running on `after()` + daily cron + "Sync now". The Vercel Queue path stays off in production. |
| **Removed** | Demo/fixture content shown to visitors | New archives start empty; old seeded content is stripped on load when untouched (#35). |

Near-term roadmap (epic `bareaga_web-ek7`):

| Horizon | Item |
|---|---|
| Now | Concierge launch pilot — 10 curators from the owner's network (`ek7.5`). |
| Now | Followed collections become sources in the Reader, closing the core loop (`ek7.2`). |
| Now | OPML import/export for sources (`ek7.3`). |
| Now | Fill a collection without filing pieces one at a time (`ek7.8`). |
| Next | Cloud-synced *preferences* (archive sync already ships), with local-first reading remaining the default. |
| Next | Reading state refinements — mark read, collapse a source, return to a quieter view — without becoming an inbox. |
| Later | Saved keyword watches / lightweight alerts, kept transparent and controllable rather than push-notification noise. |
| Later | Import as the on-ramp: an existing Are.na / Obsidian / Notion reading life *into* Coeus. |

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

Resolved by §7.1:

- *Posts vs. one-item collections* — posts fold into collections.
- *Following a person vs. following their collections* — one concept: following a person follows what they publish.
- *Community permissions vs. the visibility enum* — moot while community collections are frozen.
- *Discover's unpersisted follow state* — the local preview that held it was removed; follows are account-backed.

Still open:

- How editorial should Discover be? The current answer is no global ranking: newest published first, plus what you follow.
- Who runs the concierge outreach, and at what pace (see product-notes "Seeding & community rollout")?

---

*This document should be updated alongside significant feature or roadmap changes. Technical implementation details (file paths, architecture) live in [`HANDOFF.md`](../HANDOFF.md); this document covers product surface and rationale.*
