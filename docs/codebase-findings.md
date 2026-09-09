# Codebase findings

**Status:** Living research. This is not an implementation plan and not a
task list. Findings are indexed so later sessions can refine them. As of pass 4
most of §7 is closed: the **security envelope (§8 items 1–7) is ready to become
beads and ship**; the performance/correctness work still waits on EXPLAIN
(§7.2), a localStorage measurement (§7.7), and a deploy timing (§7.11–12).
**Started:** 2026-09-09
**Last updated:** 2026-09-09 (pass 4: §7 research closed against code + platform
docs; F-29/F-30 added; F-02/F-03/F-19/F-27 corrected)
**Beads:** `bareaga_web-dcr` (this living research). `bareaga_web-7c0` (closed
library-opportunity audit) spawned `bareaga_web-w3p`, `bareaga_web-kbt`,
`bareaga_web-m31`. Those three over-specify vendors relative to the problems
below.
**Related:** [`HANDOFF.md`](../HANDOFF.md) (what is built),
[`lib-architecture.md`](./lib-architecture.md),
[`synced-archive-architecture.md`](./synced-archive-architecture.md),
[`profile-page-plan.md`](./profile-page-plan.md) (historical; phases 1–4 shipped),
[`deployment.md`](./deployment.md).

When this file and `HANDOFF.md` disagree about *what ships today*, HANDOFF
wins. When they disagree about *risks and sequencing*, this file wins until a
plan is accepted.

---

## 0. How to use this document

- Findings are **F-xx**. Cite them from Beads and PRs; do not copy them into
  markdown TODOs.
- Tags:
  - **launch** — can bite a first real user, or a legal archive under the
    published budget (5,000 items / 8 MiB).
  - **scale** — fine at tens of items; fails at the budget or a popular profile.
  - **later** — real, but behind launch items.
  - **solid** — looks custom or large, and should stay.
- Confidence:
  - **confirmed** — read in this tree.
  - **inferred** — follows from platform defaults (Vercel, hosted PostgREST,
    browser quota). Must be measured before treating as a ship blocker.
- A finding is not a commitment to a library. `bareaga_web-w3p` (TanStack
  Virtual), `bareaga_web-kbt` (React Aria), and `bareaga_web-m31` (Inngest) are
  *possible tools* for F-04, F-18, and F-02 — not the problems themselves.

---

## 1. Research log

| Pass | Date | Scope | Outcome |
|---|---|---|---|
| 0 | 2026-09-09 | Third-party library opportunities (`bareaga_web-7c0`) | Keep sync/SSRF/rss-parser/dnd-kit. Proposed virtualize / RAC / Inngest. No app source changed. |
| 1 | 2026-09-09 | Independent review of pass 0 against current code | Agreed on keep-as-is. Disagreed on package ranking. Archive DOM is real; `indexOf`, persistence writes, and destination *dispatch* rank higher than RAC/Inngest. |
| 2 | 2026-09-09 | Broader bottleneck sweep: lists, snapshots, destinations, profile/conversation queries, client write storms, auth/media/proxy spot-check, test/CI map | F-01–F-22. |
| 3 | 2026-09-09 | Auth, RLS, Storage, OAuth, proxy, test/CI | F-23–F-28. Preview SSRF pin hole; public media bucket bypass; `after()` cookies; `safeNext`; e2e login gate. Unit glob misses nested `src/lib/feeds/`. |
| 4 | 2026-09-09 | Close §7 against code + Vercel/Supabase/GitHub/Notion docs; re-read the six security findings and the SSRF/storage/`after()` code | §7 items 1, 3, 4, 5, 6, 8, 9, 10, 14 answered; 2, 7, 11, 12, 13 still need a live system or a product call. F-19 open redirect **demonstrated**. F-29 (function `EXECUTE` not locked down) and F-30 (`isUnsafeIp` transition-range gap) added. F-02 corrected: default `maxDuration` is 300s, not 120s — the real mismatch is lease TTL 120s < function budget 300s. F-03 corrected: Vercel body cap is a hard **4.5 MB** on request *and* response. Hobby cron cannot run more than once/day (deploy-time reject), so "cron more often" is not a lever without Pro. |

Pass 2 method: read hot-path modules and migrations; compare query shape to
`ARCHIVE_BUDGET` and `supabase/config.toml`; compare `src/lib/*.ts` to
`*.test.mjs`; did **not** run EXPLAIN, a 5,000-item fixture, or a production
PostgREST config dump.

Pass 4 method: re-read the SSRF stack (`safeOutboundFetch` / `safeFeedFetch` /
`safeContentFetch` / `feedDiscovery.server`), storage migration + `profileUpload`
+ `profileApi`, `sync/route` + `archiveApi` + `supabase.server`, every
`create … function` / `revoke … function` line across all 21 migrations, and
`collectionPublication*` for the visibility cut; cross-checked against the
installed `next/dist/docs` `after`/`cookies` pages and current Vercel / Supabase /
GitHub / Notion platform docs. Still did **not** run EXPLAIN, a large-archive
fixture, a real deploy, or a browser quota test.

---

## 2. Shape of the system (one page)

Coeus is a local-first RSS reader with an optional account. The browser holds
the canonical working copy of the archive (localStorage + operation queue).
When signed in, `SyncedArchiveRepository` background-syncs field-level
operations into immutable Postgres JSONB revisions. Public surfaces
(collections, posts, profiles, conversation) are **derived** copies with a
visibility cut in application code. The browser client is Auth + profile-media
Storage only; every application table is revoked from `anon`/`authenticated`
and reached through the Next BFF with the service role
(`20260907100000_lock_down_public_tables.sql`).

```
Reader (feeds, ranking, slash)
  → save article → ArchiveData in React + localStorage
      → operation queue → POST /api/archive/sync → commit_archive_sync (full JSONB)
          → after() → destination worker (Notion sequential / GitHub one tree)
          → derivePublicationSnapshot / derivePostSnapshot → public tables

Profile / Discover / /c/[slug]
  → admin client + deriveProfileView / canSee / canSeeIndirect
```

Dependency list is intentionally tiny: Next 16, React 19, Supabase, rss-parser,
@dnd-kit. Custom code that is large is mostly product (sync, SSRF, ranking,
visibility), not accidental framework.

Two quality regimes already exist:

1. **Social/profile (bt0 and follow-ups)** — actor lists capped, keyset
   pagination on posts/collections/follows/threads, batched `.in()` target
   resolution, pgTAP + unit tests around the query-budget contract.
2. **Archive + destinations** — strong *write* protocol (revision CAS, leases,
   idempotent ops, budgets) and weak *read/render/dispatch* envelope (full
   snapshot, unbounded DOM, `after()` + daily cron, unbounded PostgREST reads).

The rest of this file is about that split.

---

## 3. Finding catalog

### Launch / correctness

#### F-01 · PostgREST `max_rows = 1000` silently truncates unbounded reads

**Tag:** launch · **Confidence:** confirmed locally; hosted value **inferred**
(Supabase default is 1000 unless raised).

Local config: `supabase/config.toml` `max_rows = 1000`. Several service-role
reads have no `.limit()`:

| Read | File |
|---|---|
| All delivery watermarks | `src/lib/destinationsStore.server.ts` `deliveries()` |
| All active destinations (cron) | same file `activeDestinations()` |
| All followee ids for Following | `src/lib/followedFeed.server.ts` |
| Follower/following **counts** | `src/lib/profileFollowStore.server.ts` `countJoinable()` |
| Collection item rows (getBySlug, RSS, some lists) | `src/lib/collectionPublicationStore.server.ts` |
| Export revision + content-snapshot lists | `src/lib/archiveRecoveryStore.server.ts` |

Archive budget is **5,000 items**. After 1,000 watermarks, `computeDirtyItems`
treats the rest as never-delivered and **re-pushes** (duplicate Notion pages /
Git files). Follow counts and Following lie above 1,000 edges. Collection
*items* are product-capped at 500, so getBySlug is safer than deliveries.

**Next measurement:** dump hosted `max_rows`; add a 1,001-row fixture test.

#### F-02 · Destination work is durable once started, not guaranteed to start or finish

**Tag:** launch · **Confidence:** confirmed (dispatch/envelope); duplicate-page
risk **inferred** from lease TTL vs runtime.

- Primary trigger: `after()` on `src/app/api/archive/sync/route.ts` — **no
  `maxDuration`**. Only the daily cron route sets `maxDuration = 300`.
- That hook re-calls `authenticateArchiveRequest()` (cookie JWT). If `after()`
  has no cookie jar, delivery is skipped and only logged.
- Catch-up: Hobby cron once a day (`vercel.json` `0 6 * * *`).
- Notion: sequential `await` per dirty item, **no per-tick cap**
  (`src/lib/destinationDelivery.ts`). First connect of hundreds of items will
  not finish inside the default **120s lease**.
- GitHub: one tree + one commit (good) of the **entire** dirty set, no
  chunking (`src/lib/obsidianGitAdapter.server.ts`). Failure is all-or-nothing.
- After a batched GitHub push, **each item still gets its own
  `record_delivery_outcome` RPC**. `destination_delivery_attempts` is
  append-only and never pruned.
- Manual `/api/archive/destinations/[destinationId]/sync` also has no
  `maxDuration`.

The worker *domain* (leases, min-interval, watermarks, stop-on-auth-error,
`httpRetry`) is **solid**. Inngest (`bareaga_web-m31`) does not replace that
domain; it is one way to fix dispatch. Cheaper levers: per-tick cap, chunk
GitHub, batch watermarks, `maxDuration` on sync routes, more frequent cron.

**Pass 4 corrections (platform docs):**

- The Vercel **default `maxDuration` is 300s on every plan** (Hobby included),
  and `after()` runs for the route's max duration. So the sync route's missing
  `maxDuration` export gives it 300s, not the ~120s the finding assumed. The
  real defect is that `runDestinationWorkerTick`'s **`leaseTtlSeconds` default
  is 120** (`destinationWorker.server.ts:168`) while the function can run 300s:
  a first-connect delivery that runs 120–300s **loses its lease mid-run**, and
  the next sync's `after()` hook can acquire it and re-deliver the same dirty
  items. `release_…_lease` no-ops on the stale token (no clobber), but Notion
  `pushUpsert` with no `externalRef` yet **creates a second page**. Fix: raise
  lease TTL to ≥ the function budget (300s) *and* cap items per tick so one run
  finishes well inside it.
- **Hobby cron cannot run more than once per day** — `0 * * * *` and friends
  *fail at deploy time* (`Hobby accounts are limited to daily cron jobs`).
  "Run the cron more often" is not available without upgrading to Pro. On
  Hobby the `after()` hook is genuinely the only near-real-time trigger, which
  raises the priority of F-27.
- Notion allows ~**3 req/s** per connection; delivery is sequential `await` per
  item. A 300-item first connect is ≥100s of wall time before `httpRetry`
  backoff — over the 120s lease, under the 300s budget. Per-tick cap (e.g.
  100 items) keeps every run bounded; the next tick continues from watermarks.
- GitHub `POST /git/trees` caps the tree array at 100,000 entries / 7 MB with
  `recursive`, plus an **undocumented ~40 MiB request-body limit**. A 5,000-note
  Obsidian first sync inlines every note's `content` in one tree body; at ~1 KB
  per note that is ~5 MB (under 7 MB but with no headroom), and larger notes
  break it — all-or-nothing, no chunking. Chunk into chained trees of ~500–1000
  entries via `base_tree`.
- The Vercel-native alternative to Inngest for `bareaga_web-m31` is **Vercel
  Workflows** (durable pause/resume, no duration cap) or **Vercel Queues**. A
  decision record should compare those first.

#### F-03 · Four different snapshot size numbers

**Tag:** launch · **Confidence:** confirmed (the four numbers); whether Vercel
4.5 MB applies to this project **inferred**.

| Bound | Value | Where |
|---|---|---|
| DB / `ARCHIVE_BUDGET.maxSnapshotBytes` | 8 MiB | `src/lib/archiveBudget.ts`, quota trigger |
| Sync HTTP body | 2 MiB | `src/lib/archiveApi.ts` `MAX_SYNC_BODY_BYTES` |
| Typical `localStorage` | ~5 MiB | browsers; not encoded in the app |
| Vercel serverless response | often ~4.5 MB | platform; not encoded in the app |

A snapshot the database will store can fail GET, fail sync (ops + entity
payloads), or throw `QuotaExceededError` in the client. `handleArchiveGet`
maps any store error to 503, so a too-large or corrupt snapshot looks like
downtime.

Publish-one-post and content-capture still `select snapshot` for the current
revision and search in process (`src/lib/postPublicationStore.server.ts`
`archiveItem()`).

**Pass 4 correction:** the Vercel limit is a **hard 4.5 MB on both the request
body and the response body** (`413 FUNCTION_PAYLOAD_TOO_LARGE`, returned by the
platform before app code runs). So a snapshot between 4.5 MiB and the 8 MiB DB
budget is un-GET-able and reads to the client as a platform 413, not the app's
503. Effective round-trip ceiling today is `min(4.5 MB response, 2 MiB sync
body)`. Options: lower `maxSnapshotBytes` and the quota trigger to ≤ 4 MiB
(simplest, and matches localStorage headroom), **or** stream `GET /api/archive`
(a streamed response is not subject to the 4.5 MB cap, and Node-runtime
streaming needs no config) if archives above 4 MiB must stay supported.

#### F-04 · Archive list mounts every matching card; `indexOf` is O(n²)

**Tag:** launch at hundreds of items; **scale** at the 5,000 ceiling ·
**Confidence:** confirmed.

`src/components/ArchiveList.tsx` maps `visible` with no window. Inside the
map: `data.items.indexOf(item)` (unfiltered array, reference search). Each
signed-in row mounts `PostPublishPanel` even when closed. Cards are
variable-height (`<details>`, notes, tags). The list is **document-scrolled**.

`ARCHIVE_BUDGET.maxItems = 5_000` is documented as a pre-launch *ceiling*, not
observed load. Virtualization (`bareaga_web-w3p`) is a tool, not step one:

1. `id → index` map.
2. Do not mount `PostPublishPanel` until open.
3. Mount cap / load-more (matches Discover/profile).
4. Measure; then window if needed. Windowing vs browser Find-in-page is a
   product tradeoff the virtualization bead does not mention.

Sidebar `itemCountIn` is collections × items on every render (**scale** under
2,000 × 5,000).

#### F-05 · Persistence queue writes every snapshot, not only the latest

**Tag:** launch as archives grow · **Confidence:** confirmed, including tests.

`src/lib/persistenceQueue.ts` `enqueue` closes over the *argument*. Rapid
stars save A, then B, then C — each a full `migrateArchiveData` (including
`new URL()` per item) + `JSON.stringify` into localStorage.
`operationsForChange` then `JSON.stringify`s **every field of every entity**
to diff (`src/lib/syncedArchiveRepository.ts`).

This is **current spec**, not an accidental bug:
`src/lib/persistenceQueue.test.mjs` asserts `saved === [1, 2]` for two
enqueues. Coalescing to `this.latest` is a behavior change with a test update.

`ArchiveContext` lives on the root layout (`src/app/layout.tsx` →
`AppProviders`). A star clones the items array and re-renders every archive
subscriber, including chrome that only needed `savedArticleIds`.

#### F-06 · `fetchValidatedHttps` buffers the whole body with no streaming cap

**Tag:** launch (function memory) · **Confidence:** confirmed.

`src/lib/safeOutboundFetch.server.ts` concatenates `data` chunks with no
max. Callers check `Content-Length` then `arrayBuffer()` size
(`safeFeedFetch.server.ts` 2 MiB, `safeContentFetch.server.ts` 5 MiB). Missing
`Content-Length` means download-until-timeout, then reject.

SSRF/DNS-pinning/manual-redirect revalidation is **solid** and tested through
`safeFeedFetch.test.mjs` with an injected `fetcher` — those tests **never
exercise** `fetchValidatedHttps` body assembly. Beads memory
`feed-fetch-lookup-hook-needs-all-option` already records that mock-fetcher
tests miss real `https.request` behavior.

Do not replace this module with a generic HTTP client.

#### F-07 · Revision retention is the union of 50 revisions and 30 days

**Tag:** launch cost if anyone syncs continuously · **Confidence:** confirmed.

`prune_all_archive_revisions` deletes only when `revision <= current - 50`
**and** `created_at` is older than 30 days
(`20260907160000_archive_quotas_retention.sql`). Sync rate limit is 60 / 300s.
Each accepted batch inserts a full JSONB row. A chatty client can retain
thousands of full snapshots for a month. Daily cron also runs this sweep
sequentially after delivery (`worker/route.ts`).

---

### Client hot path (observed without a large archive)

#### F-08 · Search persists `lastSearch` on every keystroke

**Tag:** launch (UX jank) · **Confidence:** confirmed.

`NewsApp` `onSearchChange` calls `persist({ lastSearch })`. `useDeferredValue`
only delays filtering. Each character replaces prefs, re-renders prefs
consumers, schedules localStorage (200 ms debounce in
`usePreferencesProvider`), and refreshes slash context.

#### F-09 · Slash menu rebuilds one item per headline from an unstable context

**Tag:** launch at default source counts; worse at limit 50 · **Confidence:**
confirmed.

`SiteHeader` passes a **new `context` object** every render. `SlashMenu`
`useMemo` depends on that identity. `buildSlashItems` emits one command per
article (`src/lib/slashCommands.ts`). Display is capped; **build and fuzzy
score are not**. `NewsApp` also writes the full `currentSources` array into
`ChromeProvider` on every feed batch.

#### F-10 · Ranked view is O(n²); highlight multiplies DOM nodes

**Tag:** scale at max prefs; fine at defaults · **Confidence:** confirmed.

`rankStories` greedily scans remaining candidates each pick (`src/lib/ranking.ts`)
and compiles a Unicode `RegExp` per keyword rule per story. `StoryFeed`
`highlight()` wraps every regex split in extra nodes across the **whole**
list. No windowing. Grid columns have `content-visibility: auto`; story rows
do not.

Default catalog is on the order of ~20 enabled sources × limit 10. Prefs allow
limit 50.

#### F-11 · Header logo is a 1536×1024 `unoptimized` `priority` image

**Tag:** later (first paint) · **Confidence:** confirmed.

`SiteHeader` `next/image` for `/coeus_logo.png` with width 1536, height 1024,
`priority`, `unoptimized`. Root layout also loads five `next/font/google`
families (self-hosted, so CSP `font-src 'self'` is consistent).

---

### Server / social (mostly bounded, still heavy)

#### F-12 · Profile overview still does the fat load on every tab

**Tag:** scale for a popular profile · **Confidence:** confirmed.

`src/app/u/[handle]/page.tsx` always parallel-loads:

- `listOwnedPublications` (cap 500 + two embedded counts)
- `listByAuthor` (cap 500)
- 100 likes, 100 reposts
- 50 reply roots + two descendant queries
- then sequential `followsAmong` + `thread_descendant_counts`

Collections/Posts tabs **also** run the keyset page query. Pagination was
added alongside the overview load, not instead of it. Identity load is
request-`cache()`d with metadata (good).

#### F-13 · `thread_descendants` LIMIT is on the outer SELECT, not inside the CTE

**Tag:** scale for a viral thread · **Confidence:** confirmed.

`supabase/migrations/20260909130000_thread_pagination.sql` comments say
“LIMIT inside the CTE”. The recursive CTE materializes all descendants, then
the outer query orders and `limit`s (clamped 200).
`thread_descendant_counts` walks the full subtree of up to 50 roots with no
cap.

`childrenOf` uses one global `.limit(200)` across **all** parent ids
(`conversationProfileStore.server.ts`). Fifty roots share 200 children; later
threads starve. Dedicated thread page exists for overflow.

#### F-14 · Following feed: unbounded follow graph + offset merge

**Tag:** scale · **Confidence:** confirmed.

Loads every `followee_id`, then `IN (...)` with `limit = offset+limit+1` on
each table (`followedFeed.server.ts`). Deep offsets over a union of two
independently capped tables skip rows. Visibility filtering can return a short
page while `hasMore` is true. PostgREST URL length and F-01 also apply.

#### F-15 · Discover `listPublic` counts by downloading item id rows

**Tag:** later · **Confidence:** confirmed.

`collectionPublicationStore.server.ts` `listPublic` selects every
`publication_id` for the page instead of an embedded count (the profile path
already uses `collection_publication_items(count)`).

#### F-16 · Feed cache is good in-process and empty on every cold isolate

**Tag:** launch UX flake after idle/deploy · **Confidence:** confirmed cache
shape; timeout **inferred** from Hobby defaults.

`feeds.server.ts`: `BoundedCache(250)`, 50 items/feed, concurrency 8, 6 s
timeout, in-flight de-dupe, stale-while-revalidate. `/api/feeds` has no
`maxDuration`. Default reader asks for on the order of 20 sources. HN
enrichment fans out up to 50 Firebase calls; `hnMetricsCache` is an
**unbounded** `Map` (`engagement.server.ts`). Refresh budget
(`feedRefreshGuard.server.ts`) is process-local (80 sources / 60s per IP).
CDN `s-maxage=90` only helps after a success.

#### F-17 · Admin client + application-layer visibility is intentional

**Tag:** solid, with a footgun · **Confidence:** confirmed.

`lock_down_public_tables` + service role + `canSee` / `canSeeIndirect` /
`deriveProfileView` is the product security model, not a missing RLS policy.
The footgun is any new reader that uses the admin client and **forgets** the
derive layer. Conversation create path does gate
`actorCanReachTarget` (`conversationApi.ts`). Keep this pattern; do not “fix”
it by putting PostgREST in the browser.

---

### Interaction / a11y (smaller than pass 0 claimed)

#### F-18 · Account menu is `role="menu"` without arrow keys

**Tag:** later · **Confidence:** confirmed.

`AccountMenu` handles Escape and outside click only. Four items. `SlashMenu`
and mobile Settings already use `useModalDialog` (inert, trap, Escape,
restore) and have component tests (`interaction.test.tsx`). React Aria
(`bareaga_web-kbt`) is optional if a second combobox appears; it is not the
next dependency.

Desktop Settings: Escape + outside click, no trap. Inactive tabs stay mounted
(`hidden={...}`).

---

### Auth, proxy, media (spot-check; §7 still open)

#### F-19 · Notion OAuth state and proxy redirects are solid; `safeNext` is not

**Status:** fixed on the working tree (`bareaga_web-dmm.2`, not yet committed) —
`src/lib/safeRedirect.ts` `safeInternalPath` + `safeRedirect.test.mjs`, wired
into all three call sites.

**Tag:** launch (open redirect) · **Confidence:** confirmed — the bypass is
**demonstrated** (`new URL('/\\evil.com', origin).href` → `https://evil.com/`).

Notion OAuth: HMAC-SHA256, `timingSafeEqual`, 10 min TTL, DB nonce, consume
once, `sub` must match `ownerId`. Proxy (`src/proxy.ts`) only refreshes JWT
and redirects `/signin` ↔ `/welcome` from claims; matcher skips `/api`.

`safeNext` allows any string that starts with `/` and not `//`. `/\evil.com`
passes both checks, and WHATWG resolves `/\` to an authority, so the callback's
`Response.redirect(new URL(next, url), 302)` — fired right after
`exchangeCodeForSession` sets the session cookies — sends the browser to an
attacker origin. The weak helper is **copied in three places**:

| File | Fallback |
|---|---|
| `src/app/auth/callback/route.ts` | `/welcome` |
| `src/app/signin/page.tsx` | `/welcome` |
| `src/components/WelcomeForm.tsx` | `/archive` |

**Fix:** one primitive — parse `new URL(raw, 'http://x')`, return
`url.pathname + url.search` only when `url.origin === 'http://x'` and there is
no `\` / control char / whitespace; else the fallback. Cover with a unit test
that includes `/\evil.com`, `//evil.com`, `/\/evil.com`, `https://evil.com`.

#### F-23 · Source preview undoes DNS pinning

**Status:** fixed on the working tree (`bareaga_web-dmm.1`, not yet committed) —
`resolveFeedUrl`'s `fetcher` default is now `undefined`; regression test added.

**Tag:** launch · **Confidence:** confirmed.

`fetchFeedText` uses `fetchValidatedHttps` (pinned lookup) only when `fetcher`
is `undefined`. `resolveFeedUrl` defaults `fetcher = fetch`
(`feedDiscovery.server.ts`). `previewFeedUrl()` calls that default.
Unauthenticated `POST /api/sources/preview` therefore validates DNS, then
fetches with global `fetch` (second lookup — the rebinding window the pin
exists to close). Catalog `feeds.server.ts` and content capture do **not**
pass a fetcher and stay pinned.

Rate limit is process-local (`feedRefreshGuard.server.ts`).

**Fix:** the `undefined` sentinel must reach `fetchFeedText`. Change
`resolveFeedUrl`'s signature to `fetcher: typeof fetch | undefined = undefined`
(matching `fetchFeedText` / `fetchSafeContent`) and drop the `= fetch` default,
so `previewFeedUrl` → `resolveFeedUrl(raw)` takes the pinned
`fetchValidatedHttps` branch. Tests inject their own `fetcher` and are
unaffected. (Passing `resolveFeedUrl(raw, undefined, lookup)` at the call site
without the signature change does **not** work — `undefined` re-triggers the
`= fetch` default.)

#### F-24 · Public `profile-media` bucket skips the BFF allowlist

**Status:** fixed on the working tree (`bareaga_web-dmm.5`, not yet committed) —
migration `20260909140000_profile_media_lockdown.sql` drops the client
insert/update storage policies (bucket is now BFF-only; the media route uses the
service-role client) and sets `allowed_mime_types` + `file_size_limit` on the
bucket. pgTAP in `profile_surface.test.sql`.

**Tag:** launch · **Confidence:** confirmed.

App upload path: magic bytes, PNG/JPEG/WebP, 2 MB/5 MB
(`profileUpload.ts`). Storage policies
(`20260906120000_profile_surface.sql`): bucket `public = true`;
authenticated insert/update/delete scoped to `<uid>/` prefix; **no**
`file_size_limit`, **no** `allowed_mime_types`. A signed-in browser with the
publishable key can POST to Storage REST and host HTML/SVG under a public
URL.

**Fix:** bucket MIME + size limits; prefer BFF-only writes (drop client
insert policies) or signed upload URLs issued after validation. Keep public
read.

#### F-25 · Avatar/cover CHECK does not pin the Storage host

**Status:** fixed on the working tree (`bareaga_web-dmm.5`, not yet committed).
The CHECK is now `^https://…/profile-media/<uuid>/` (https + uuid prefix; host
pinned in `normalizeBucketUrl` where `NEXT_PUBLIC_SUPABASE_URL` is visible, on
both client and BFF). `validateProfileInput` rejects a non-bucket URL with an
`avatarUrl`/`coverUrl` error instead of silently passing it. CSP `img-src`
narrowed from `https:` to `'self' data: blob:` + the Supabase origin.

**Tag:** launch (XSS/content injection via `img`) · **Confidence:** confirmed.

SQL comment says the row cannot point at a third-party host. The CHECK is
`^https?://[^/]+/storage/v1/object/public/profile-media/` — host-agnostic,
and `http` allowed. `validateProfileInput` only trims
(`normalizeBucketUrl`). CSP `img-src … https:` will load it.

Confirmed pass 4: the CHECK's `[^/]+` matches **any** host, so
`avatarUrl = 'https://evil.example/storage/v1/object/public/profile-media/x.svg'`
passes both the CHECK and `validateProfileInput` (which only trims), and
`PUT /api/account/profile` writes it. `handleSaveProfile` never checks the URL
was produced by the media upload route. The profile page then renders
`<img src>` at the attacker host — CSP `img-src … https:` allows it. Not
script-XSS (bucket is `*.supabase.co`, cross-origin), but it is content
injection + visitor-IP logging on every profile view.

**Fix:** pin host to `NEXT_PUBLIC_SUPABASE_URL`, require `https:`, require
path prefix `${uid}/`, in both the CHECK and `validateProfileInput`. Tighten
CSP `img-src` from `https:` to the Supabase project origin (+ `'self' data:
blob:`) as defence-in-depth for both F-25 and F-20.

#### F-26 · `/api/test/session` is not production-proof

**Status:** fixed on the working tree (`bareaga_web-dmm.4`, not yet committed) —
`testLoginEnabled()` also fails closed on `NODE_ENV === "production"`, and `POST`
now rejects any `email` not on the reserved `@e2e.coeus.local` domain (all
fixtures already use it; `next dev` in Playwright keeps `NODE_ENV` at
`development`). No migration.

**Tag:** launch if the flag leaks · **Confidence:** confirmed.

Enabled when `E2E_TEST_LOGIN=1` and `VERCEL_ENV !== "production"`. No
`NODE_ENV` check, no email allowlist. Vercel **preview** is not
`production`. A non-Vercel deploy with `VERCEL_ENV` unset enables the
route: service-role user upsert, magic link, `sb-*` cookies, and
`DELETE ?purge=1`.

Confirmed pass 4: the `POST` path accepts **any** email (only `DELETE ?purge=1`
is domain-scoped). A leaked flag means `POST {email:"someone@real.com"}` mints
a valid `sb-*` session for that account — full takeover of any existing user,
including whoever already owns that email.

**Fix:** fail closed on `NODE_ENV === "production"` **or**
`VERCEL_ENV === "production"` **or** absence of an explicit
`E2E_ALLOW_TEST_LOGIN` allow-marker; restrict `POST` emails to
`@e2e.coeus.local`; ideally keep the file out of the production build (a
`src/app/api/test/` segment excluded by config, or a build-time guard).

#### F-27 · `after()` re-authenticates via `cookies()`

**Status:** fixed on the working tree (`bareaga_web-dmm.3`, not yet committed) —
`sync/route.ts` captures `ownerId` before `after()` and the hook uses a closure.

**Tag:** launch (F-02 amplifier) · **Confidence:** confirmed call; failure
mode narrowed by pass 4.

`sync/route.ts` already authenticated the request, then the hook calls
`authenticateArchiveRequest()` → `cookies()` → `getClaims()`, and
`createRequestSupabaseClient` `setAll` **writes** cookies.

**Pass 4 (installed `next/dist/docs/.../after.md`):** in a **Route Handler**,
`cookies()` inside `after()` is *supported* and does not throw (unlike a Server
Component), and the jar is present — so the "delivery silently skipped" mode
the finding worried about is unlikely. The residual defects are real but
smaller: (1) a redundant `getClaims()` (JWKS/`/auth/v1/user` work) on every
sync; (2) if that call triggers a Supabase token refresh, `setAll` emits
`Set-Cookie` **after the response is flushed** — the rotated refresh token is
dropped, and Supabase rotation means the browser's stored refresh token then
goes stale → intermittent forced sign-out or refresh-reuse lockout.

**Fix (unchanged, cheap):** `handleArchiveSync` already has `ownerId`; capture
it in the route before `after()` (e.g. `authenticate: async () => ownerId` with
a single pre-`after()` `authenticateArchiveRequest()` call) and use the
cookie-free admin client inside the hook.

#### F-28 · Media upload reads the whole body, then checks size

**Tag:** later (availability), same class as F-06 · **Confidence:** confirmed.

`profileMediaApi.ts` `file.arrayBuffer()` then `validateUpload` size cap.
No `Content-Length` reject first. Product caps are 2 MB/5 MB but only after
buffering.

#### F-20 · Profile media: magic bytes + size caps; CSP `img-src` is `https:`

**Tag:** solid upload path; later CSP tightness · **Confidence:** confirmed.

`profileUpload.ts` sniffs PNG/JPEG/WebP, caps 2 MB / 5 MB. API reads the full
body then validates (size is checked on the buffer, not a streaming cap —
same class as F-06, smaller because of the product cap). CSP
(`securityHeaders.ts`) allows `img-src 'self' data: blob: https:` so any HTTPS
image can load as avatar/cover. `script-src 'unsafe-inline'` is documented as
required for Next bootstrap.

#### F-21 · `robots.ts` disallows `/u/` but canonical profiles are `/@handle`

**Tag:** later (SEO) · **Confidence:** confirmed; crawler behavior **inferred**.

Disallow includes `/u/`, `/archive/`, `/api/`. Canonical URLs are `/@handle`
(rewrite in `next.config.ts`). Crawlers that honor canonical may still index
profiles; those that request `/u/...` will not. Public collections `/c` are
allowed. Confirm whether `/@handle` should be indexable.

#### F-22 · Public pages are `force-dynamic` by design

**Tag:** later (TTR / cost) · **Confidence:** confirmed.

`/@handle`, `/c/[slug]`, `/discover` are `dynamic = "force-dynamic"` because
visibility depends on the viewer. CDN caching public-only variants is a
product decision, not a missed `cacheLife`. Do not “fix” this without a
private-by-default story.

#### F-29 · Table lockdown does not lock down `EXECUTE` on functions

**Status:** fixed on the working tree (`bareaga_web-dmm.6`, not yet committed) —
migration `20260909150000_lock_down_public_functions.sql` does a blanket
`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon,
authenticated` + the matching `ALTER DEFAULT PRIVILEGES`. `service_role`
(the BFF) keeps its per-function grants; pgTAP in `schema_lockdown.test.sql`
asserts anon/authenticated have zero executable public functions and that
`service_role` still can. Revoking from `PUBLIC` (not just the two roles, as
originally sketched) is what actually closes it — a `REVOKE … FROM anon` alone
is a no-op while the default `PUBLIC` grant stands.

**Tag:** launch (defence-in-depth gap; not currently exploitable) ·
**Confidence:** confirmed (all 21 migrations read pass 4).

`20260907100000_lock_down_public_tables.sql` revokes `ALL PRIVILEGES ON ALL
TABLES` from `anon, authenticated` and sets `ALTER DEFAULT PRIVILEGES … REVOKE
… ON TABLES`. It does **not** touch functions. Postgres grants `EXECUTE` on a
new function to `PUBLIC` by default, and Supabase's PostgREST exposes
`public`-schema functions as `POST /rest/v1/rpc/<name>` to whatever role the
request carries. So the lockdown relies entirely on **every function migration
individually** running `revoke all on function … from public, anon,
authenticated`.

Pass 4 audit: every *callable* RPC today (`publish_*`, `unpublish_*`,
`like_target`, `repost_target`, `create_reply`/`update_reply`/`delete_reply`,
`commit_archive_sync`, `initialize_archive`, `restore_archive_revision`,
`save_profile`, `change_handle`, `handle_available`, `consume_notion_oauth_state`,
all lease / budget / retention / storage-growth fns, `thread_descendants*`) **is
individually revoked** — the discipline has held. The unrevoked functions are
all **trigger functions** (`touch_updated_at`, `guard_profile_handle_update`,
`conversation_target_exists` — the last is `SECURITY DEFINER`,
`enforce_archive_revision_budget`), which error out when called bare over RPC
because they dereference `NEW` / `TG_*`. So there is **no live hole**, but the
model is one forgotten line from an anon-callable `SECURITY DEFINER` RPC that
bypasses the whole BFF.

**Fix:** add to the lockdown migration (and keep it as the last word):
`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;`
plus `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE
EXECUTE ON FUNCTIONS FROM anon, authenticated;` and re-`GRANT EXECUTE … TO
service_role` where the BFF needs it. Consider the same for `SEQUENCES`. A
pgTAP test that asserts no `public` function is executable by `anon` /
`authenticated` would make this permanent.

#### F-30 · `isUnsafeIp` misses IPv6 transition ranges (NAT64 / 6to4 / Teredo)

**Tag:** scale/later (SSRF depth) · **Confidence:** confirmed (code); exploitability
**inferred** — needs a runtime with the transition mechanism routed.

`ipv6IsUnsafe` (`safeOutboundFetch.server.ts`) covers `::`, `::1`, `fc00::/7`,
`fe80::/10`, `ff00::/8`, `2001:db8::/32`, and decodes IPv4-mapped
(`::ffff:0:0/96`) / IPv4-compatible (`::/96`). It does **not** reject:

| Range | Purpose | Risk |
|---|---|---|
| `64:ff9b::/96`, `64:ff9b:1::/48` | NAT64 (RFC 6052 / 8215) | embeds an IPv4; on a NAT64 host `64:ff9b::7f00:1` reaches `127.0.0.1` |
| `2002::/16` | 6to4 (RFC 3056) | `groups[1..2]` embed an IPv4 |
| `2001::/32` | Teredo (RFC 4380) | embeds server + (obfuscated) client IPv4 |

Vercel's Node runtime is unlikely to route NAT64/6to4 today, but this is the
kind of gap that a base-image change silently opens. The existing "reject if
**any** resolved address is unsafe" logic already blunts the classic
one-good-one-bad DNS trick — this just extends the literal check.

**Fix:** in `ipv6IsUnsafe`, detect `64:ff9b::/96` (+ `64:ff9b:1::/48`),
`2002::/16`, `2001::/32`, extract the embedded IPv4, and run it through
`ipv4IsUnsafe`. Add fixtures to a real `safeOutboundFetch.server.test.mjs`
(the module still has no dedicated test — see §5).

---

## 4. What we will not replace (pass 0, restated)

These remain **solid**. A generic library would drop contracts this product
needs:

- SSRF stack: HTTPS-only, private/CGNAT/IPv4-mapped blocked, DNS pin via
  `lookup` hook, manual redirects with re-validation, hop/timeout caps.
- Archive sync protocol: field-level ops, CAS revision, idempotent
  `archive_operations`, 60/5 min RPC, 500 ops/batch.
- Destination leases, min-interval, stop-on-auth-error, GitHub single commit
  *when the payload fits*.
- `rss-parser`, `@dnd-kit`, direct Supabase in the BFF (not the browser).
- Feed progressive batching (`FEED_BATCH_SIZE = 6`, concurrency 2) and the
  local-first archive queue.
- Visibility derive (`canSee`, `canSeeIndirect`, publication/post snapshots).
- `useModalDialog` as the shared dialog primitive.

Pass 0’s “extract duplicated RSS Parser config” is **weak**:
`feeds.server.ts` has `customFields`; discovery does not. Parameterizing the
redirect loops (F-06’s callers) is worth it **after** a streaming size cap and
regression tests.

---

## 5. Coverage map

CI (`.github/workflows/ci.yml`): lint, `tsc --noEmit`, `test:unit`, `test:ui`,
production build with placeholder public env, `npm audit --audit-level=high`,
pgTAP via `supabase start` + `supabase test db`. E2E is a separate concern
(`bareaga_web-ubj.*` still open).

**Glob hole:** `test:unit` is `src/lib/*.test.mjs` — nested
`src/lib/feeds/*.test.mjs` would never run (and `src/lib/feeds/feeds.server.ts`
has no test today). `src/hooks/` is not collected. Fix: widen to
`src/lib/**/*.test.mjs` and add `src/hooks/**/*.test.*`. (§7.14)

**Unit/UI that exist and matter:** archive sync/validation/budget/API,
destination delivery/worker/secrets/OAuth state, conversation derive + API,
profile store pagination tests, feed contract/query/discovery, safe *feed*
fetch (injected fetcher), persistence queue (ordered saves), interaction
(slash trap, mobile settings, account menu happy path).

**Production logic with no dedicated test file** (not exhaustive; some is
covered indirectly):

| Module | Why it matters |
|---|---|
| `safeOutboundFetch.server.ts` | F-06; lookup hook already bit production once |
| `safeContentFetch.server.ts` | capture path |
| `destinationsStore.server.ts` | F-01 deliveries |
| `collectionPublicationStore.server.ts` | F-15, getBySlug items |
| `followedFeed.server.ts` | F-14 |
| `profileFollowStore.server.ts` | F-01 counts |
| `feeds/feeds.server.ts` | cold cache, HN fan-out |
| `feedRefreshGuard.server.ts` | process-local budget |
| `slashCommands.ts` | F-09 |
| `localArchiveRepository.ts` | quota, migration |
| `NewsApp.tsx` / `ArchiveList.tsx` / `StoryFeed.tsx` | F-04, F-08, F-10 |

**E2E today:** `e2e/auth.spec.ts`, `profile.spec.ts`, `public.spec.ts`,
`routes.spec.ts`. Open beads already name the missing journeys: archive
save→sync→reload (`ubj.2`), destinations + Notion OAuth mock (`ubj.4`),
canonical handle 308 + visibility revocation (`ubj.5`). There is no
`archive.spec.ts`.

**Observability:** `/api/health` (config + `archives` exact count), uptime
workflow, log-threshold workflow, storage-growth workflow (secret bead
`bareaga_web-9hc`). Health `count: exact` on `archives` is a possible
unnecessary sequential scan (later).

---

## 6. Relationship to existing Beads

| Bead | Pass 0 framing | This document |
|---|---|---|
| `bareaga_web-w3p` | Introduce `@tanstack/react-virtual` | F-04. Problem is unbounded archive DOM. Library is step 4 after map/cap/measure. |
| `bareaga_web-kbt` | Adopt React Aria Components | F-18. Fix AccountMenu keys; keep `useModalDialog`. |
| `bareaga_web-m31` | Evaluate Inngest | F-02. Decision record is the right shape; do dispatch/caps first. |
| `bareaga_web-ubj.*` | E2E journeys | Still the right tests; they would have caught none of F-01/F-05/F-06. |
| `bareaga_web-7c0` | Closed library audit | Keep the keep-as-is section; do not treat its ranking as the plan. |

Do **not** file a markdown TODO for F-01–F-30. When a finding is accepted as
work, create or retitle a bead that names the *problem*, not the vendor.

Pass 4 also reframes `bareaga_web-m31` again: the Vercel-native durable-workflow
options (**Workflows**, **Queues**) should be the baseline in that decision
record, with Inngest as one external alternative — and the cheap levers in F-02
(lease TTL, per-tick cap, GitHub chunking) come first regardless.

---

## 7. Remaining research

Pass 4 status per item. **Answered** items no longer block a plan; **open**
items still need a live system or a product decision.

1. **Hosted PostgREST `max_rows`.** *Answered.* Supabase hosted default is
   **1,000**, same as `config.toml` (settable in Project Settings → API → Max
   Rows). `service_role` bypasses **RLS, not `db-max-rows`** — the cap is a
   PostgREST response limit applied to every role, RPC `RETURNS TABLE`
   included. F-01 stands: every unbounded service-role read is silently
   truncated at 1,000. Fix with explicit `.range()` pagination or by moving
   aggregation into SQL (`count`, embedded `(count)`).
2. **EXPLAIN.** *Open — needs the DB.* Requires `supabase db` access or a prod
   read replica. Do before F-01/F-12/F-13/F-15 index work; not a blocker for
   the security envelope or the persistence/list fixes.
3. **`after()` cookie behavior.** *Answered from installed docs* — see F-27.
   Route handlers may read cookies in `after()`; the risk is a dropped token
   rotation, not a skipped delivery. Capture `ownerId` before `after()`
   regardless.
4. **Vercel `maxDuration` / body limits.** *Answered.* Default `maxDuration` is
   **300s on every plan** (Hobby max is also 300s; Pro 800s GA / 1800s beta).
   Request **and** response body cap is a hard **4.5 MB** (`413
   FUNCTION_PAYLOAD_TOO_LARGE`) unless the response is streamed. Memory: Hobby
   2 GB / 1 vCPU. **Hobby cron cannot run more than once/day** (deploy-time
   reject). Fed into F-02 and F-03.
5. **GitHub tree payload.** *Answered.* Tree array ≤ 100,000 entries / 7 MB
   (`recursive`); undocumented ~40 MiB request-body cap. A 5,000-note first
   sync is ~5 MB of inlined `content` with no headroom → chunk. See F-02.
6. **Notion rate limits.** *Answered.* ~3 req/s per connection + per-workspace
   limits; 429 with `Retry-After`; payload 500 KB / 1000 blocks (adapter sends
   one block — fine). Sequential per-item delivery of a few hundred items
   exceeds the 120s lease TTL. See F-02.
7. **localStorage quota.** *Open — needs a browser test.* ~5 MiB is the folk
   number; the real cap and eviction behaviour with prefs + op queue + archive
   together needs a measured run in Chrome/Safari/Firefox. Blocks the F-03
   budget-alignment number (pick ≤ 4 MiB only after confirming the client can
   hold that + the queue).
8. **Admin-client visibility cut.** *Answered for the sampled paths.* Pass 4
   read the collection path end to end: `/c/[slug]` applies `canSee()` for
   private/followers, `/c/[slug]/rss.xml` restricts to public/unlisted,
   `/api/collections/discover` → `listPublic` filters `visibility='public'`.
   All clean. A **full sweep of all ~25 call sites + an ESLint/pgTAP guard**
   that flags an admin-client read with no derive call is still worth doing
   (F-17 footgun); tracked as opportunistic, not a blocker.
9. **IPv6 transition ranges.** *Answered — it's a gap.* Promoted to **F-30**.
10. **Function `EXECUTE` grants.** *Answered — it's a gap.* Promoted to
    **F-29**. No live hole today; the lockdown migration should still add a
    blanket revoke.
11. **First-connect timing vs lease.** *Open — needs a timed run,* but the
    shape is now clear from items 5–6: lease TTL 120s < function budget 300s <
    a 300-item Notion first connect. Fix (raise TTL, cap per tick) does not
    need the measurement; the measurement just sizes the cap.
12. **Feed cold-start wall time.** *Open — needs a deploy.* `/api/feeds` has no
    `maxDuration` (→ 300s), 6s per-feed timeout, concurrency 8, ~20 default
    sources; cold isolate = empty `BoundedCache`. Measure p95 cold TTFB.
13. **Should `/@handle` be indexed?** *Open — product call.* `robots.ts`
    disallows `/u/` (the render route) but **not** `/@` or `/c`. Collections
    already gate `robots: { index: visibility === 'public' }` per page;
    profiles do not. Decide, then make the profile page's `generateMetadata`
    set `robots.index` from visibility the same way, and drop `/u/` from
    `robots.ts` disallow (or keep both consistent).
14. **`src/lib` layer violations.** *Largely answered.* An ESLint
    import-boundary rule is already ratcheted to `error`
    (`bareaga_web-tpy`/`56v`), so the dangerous edges (domain core → `server` /
    `next` / `*Api`; component → `*.server` value import) are mechanically
    enforced. Residual is the opportunistic directory moves
    (`bareaga_web-4po`/`a2n`) and the **`test:unit` glob hole**: it globs
    `src/lib/*.test.mjs`, so a future `src/lib/feeds/*.test.mjs` (or anything
    under `src/hooks/`) silently never runs. `src/lib/feeds/feeds.server.ts`
    has no test at all today. Small bead: widen the glob to `src/lib/**/*.test.mjs`.
15. **CI gaps.** *Open — low effort, do alongside E2E work.* Playwright trace
    upload on failure; `log-alerts.yml` needs `VERCEL_TOKEN`; the health probe
    does not assert `DESTINATION_TOKEN_ENCRYPTION_KEY` / `CRON_SECRET` /
    Notion OAuth vars exist.

**Still genuinely blocking a full PR plan:** only items 2, 7, 11, 12 (each
needs a live DB, browser, or deploy) and item 13 (a product decision). The
security envelope (§8 items 1–6) plus F-29 needs none of them.

---

## 8. Draft sequencing (not accepted)

Order for when we *do* plan. Problems, not packages:

Security envelope first — **all seven ship without any §7 measurement, and pass
4 confirmed each one.** Tracked under epic `bareaga_web-dmm`. Cheapest-first:

> **Progress (2026-09-09):** all six envelope items are **done on the working
> tree, not committed** — `bareaga_web-dmm.1`–`.6`. Items 1–3 (F-23, F-19, F-27)
> are code-only; items 4–6 (F-26; F-24+F-25; F-29) land two new migrations
> (`20260909140000_profile_media_lockdown.sql`,
> `20260909150000_lock_down_public_functions.sql`) plus code, verified with
> `supabase test db` (300 pgTAP pass) and `npm test` (480 unit + 66 UI).
> **F-24 outcome:** BFF-only — client `insert`/`update` storage policies
> dropped, media route switched to the service-role client.


1. **F-23** — change `resolveFeedUrl`'s `fetcher` default from `fetch` to
   `undefined` so `previewFeedUrl` stays DNS-pinned. ~2 lines + a test.
2. **F-19** — one `safeInternalPath` primitive, used in all three `safeNext`
   copies, + a bypass-vector unit test.
3. **F-27** — capture `ownerId` in `sync/route.ts` before `after()`; admin
   client in the hook.
4. **F-26** — add `NODE_ENV`/allow-marker gate + `POST` email allowlist to
   `/api/test/session`; try to exclude it from the prod build.
5. **F-25** — pin avatar/cover URL (host = `NEXT_PUBLIC_SUPABASE_URL`, `https:`,
   `${uid}/` prefix) in the CHECK **and** `validateProfileInput`; tighten CSP
   `img-src`. One migration + one validator change.
6. **F-24** — set `file_size_limit` + `allowed_mime_types` on the
   `profile-media` bucket; drop the client `insert`/`update` policies in favour
   of BFF-only writes (or signed upload URLs). One migration.
7. **F-29** — add `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public` +
   `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS` to the lockdown
   migration; re-grant `service_role`; pgTAP guard. One migration + one test.

Items 4–6 touch the database and want a paired pgTAP test; 1–3 and 7 are small
and self-contained. F-24 + F-25 are one PR (both about the media bucket).

Then performance/correctness (some wait on §7 items 2/7/11/12):

8. Limit or page every unbounded PostgREST read (F-01), `deliveries()` first
   (duplicate-delivery risk). Needs EXPLAIN (§7.2) only for the index choices,
   not for the `.range()` calls.
9. F-02 dispatch: **raise `leaseTtlSeconds` to ≥ 300** (currently 120, below
   the function budget), cap dirty items per tick (~100), add `maxDuration`
   to the sync + manual sync routes, chunk the GitHub tree (~500/commit),
   batch `record_delivery_outcome`. **"Cron more often" is off the table on
   Hobby** — if near-real-time catch-up matters, that is a Pro upgrade or a
   Vercel Workflow/Queue, which is the real content of `bareaga_web-m31`.
10. Coalesce persistence to latest snapshot; stop field-wise stringify diffs;
    debounce or blur-save `lastSearch` (F-05, F-08). Tests currently lock in
    ordered full saves — update them in the same PR.
11. Archive list: index map, lazy publish panel, then a mount cap (F-04).
12. Align the snapshot budgets (F-03): set `maxSnapshotBytes` ≤ 4 MiB (after
    §7.7 confirms client headroom) **or** stream `GET /api/archive`.
13. Streaming byte cap in `fetchValidatedHttps` and media uploads (F-06, F-28).
14. Stabilize slash `context`; don't build one command per article until the
    query looks like a headline (F-09).
15. Skip unused profile tab queries; push LIMIT into the thread CTE (F-12, F-13).
16. AccountMenu keyboard (F-18). Header image (F-11). `/@handle` robots (F-21,
    after the §7.13 product call).
17. Only then: virtualization, RAC, Query, Zod, Inngest/Workflows — if the
    problem they solve is still visible.

The security envelope (items 1–7) is ready to become beads and ship now. The
performance work should wait on EXPLAIN (§7.2) and a localStorage measurement
(§7.7) for the parts that need a number; the rest (9, 10, 11, 14) can start.

---

## 9. Document maintenance

- Append a row to §1 when a pass closes or overturns a finding.
- Change a finding in place; do not leave contradictory copies.
- When a finding ships, mark **Status: shipped** on the finding and point at
  the bead/PR. Do not delete evidence.
- If this file and a bead title diverge, retitle the bead to the problem.
