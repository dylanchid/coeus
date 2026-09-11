# Codebase findings

**Status:** Living research. This is not an implementation plan and not a
task list. Findings are indexed so later sessions can refine them. As of pass 5
the **security envelope (§8 items 1–7) is done on the working tree** (epic
`bareaga_web-dmm`, not yet committed as a ship). F-32 is **fixed-on-tree**.
F-31 and F-32 are **fixed-on-tree**. Performance/correctness still
waits on EXPLAIN (§7.2), a localStorage measurement (§7.7), and a deploy
timing (§7.11–12).
**Started:** 2026-09-09
**Last updated:** 2026-09-11 (pass 5: sliced S1–S10 + skeptic; F-31–F-51;
fixed-on-tree / narrowed catalog refresh)
**Beads:** `bareaga_web-dcr` (this living research). `bareaga_web-7c0` (closed
library-opportunity audit) spawned `bareaga_web-w3p`, `bareaga_web-kbt`,
`bareaga_web-m31`. Those three over-specify vendors relative to the problems
below. Pass 5 launch work: F-31 and F-32 fixed-on-tree (see §6).
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
| 5 | 2026-09-11 | Sliced S1–S10 + independent skeptic (`bareaga_web-dcr.1.1`–`.1.12`) | Catalog F-01–F-30 re-opened on the working tree. **Fixed-on-tree:** F-06, F-07, F-19, F-23, F-24, F-25, F-26, F-27, F-29 (F-20 CSP half). **Narrowed:** F-02, F-04, F-05, F-09, F-12; F-13 SQL CTE gone (`thread_root_key`), `childrenOf` remainder. F-14 visibility sentence inverted. F-01 cap stands; destination/item/followee/count/recovery rows now paged. Launch keeps: F-31 (Notion PATCH title-only), F-32 (collection follow skips `canSee`). Scale keeps: F-33–F-35. Later keeps: F-36–F-51 (S9-1/2/4 folded into §5 / §7.14–15, not minted). Merges into existing ids, not new ones: S1-3/S1-4→F-03; S2-3→F-02; S4-1/S4-2/S5-2→F-01; S4-3→F-28; S5-4→F-22; S6-1→F-13; S6-2/S6-3→F-14; S7-1→F-05; S10-3→F-21. Still no live EXPLAIN, quota run, or deploy timing. |

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

Pass 5 method: ten file-owned slices (S1–S10) re-read the current tree against
F-01–F-30 and proposed F-TEMP candidates; skeptic (`bareaga_web-dcr.1.12`)
kept/rejected/merged/demoted each candidate against kill rules (wrong citation,
already catalogued, fixed-on-tree, launch only if a 5k archive / first Notion
connect / popular profile would hit it). Synthesis assigned F-31+ only to
skeptic **keep** (not merge) items. Still did **not** run a loaded EXPLAIN
ANALYZE, a 5,000-item fixture, a production PostgREST dump, a browser quota
test, or a timed first-connect.

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
   idempotent ops, budgets). Pass 5 found the cheap dispatch levers already
   on tree (lease TTL 300, 100 items/tick, GitHub chunk 500, batched watermarks,
   `maxDuration=300` on sync/cron). Residual envelope: full snapshot GET,
   document-scrolled archive list, Hobby daily cron as the only catch-up,
   and a handful of still-unbounded PostgREST reads (F-01 remainder).

The rest of this file is about that split.

---

## 3. Finding catalog

### Launch / correctness

#### F-01 · PostgREST `max_rows = 1000` silently truncates unbounded reads

**Tag:** launch · **Confidence:** confirmed locally; hosted value **inferred**
(Supabase default is 1000 unless raised).

**Pass 5:** the **cap stands**. Several catalog rows are now paged
(`readAllPages` / `POSTGREST_PAGE_SIZE=1000`); truncation on those paths is
patched, cost remains. Residual unbounded reads still silently stop at 1,000.

Local config: `supabase/config.toml` `max_rows = 1000`. Service-role reads:

| Read | File | Pass 5 |
|---|---|---|
| Delivery watermarks | `destinationsStore.server.ts` `deliveries()` | **paged** `readAllPages` |
| Active destinations (cron) | same file `activeDestinations()` | **paged** |
| Followee ids for Following | `followedFeed.server.ts` | **paged** `readAllPages` |
| Follower/following **counts** | `profileFollowStore.server.ts` `countJoinable()` | **paged** (still downloads the whole graph, then batched head-count — S4-1) |
| Collection item rows (getBySlug, RSS, some lists) | `collectionPublicationStore.server.ts` `collectionItems()` | **paged** |
| Export revision + content-snapshot lists | `archiveRecoveryStore.server.ts` | **paged** (`revision,created_at` / snapshot metadata) |
| Followed collections (full publications + items) | `collectionPublicationStore.server.ts` `listFollowed()` | **still unbounded** (S5-2) |
| `GET /api/profiles/followed` | `profileFollowStore.server.ts` `listFollowed()` | **still unbounded**; no `src/` or e2e caller (S4-2, later) |
| Owner collection list | `collectionPublicationStore.server.ts` `list(ownerId)` | **still unbounded** (product-small) |

Archive budget is **5,000 items**. The original “after 1,000 watermarks,
`computeDirtyItems` re-pushes” hole is closed for destinations. Follow
*counts* are complete above 1,000 edges but still pay for every row.
Collection *items* remain product-capped at 500.

**Next measurement:** dump hosted `max_rows`; add a 1,001-row fixture on a
still-unbounded path (`listFollowed` collections).

#### F-02 · Destination work is durable once started, not guaranteed to start or finish

**Tag:** launch (start/finish/drain) · **Confidence:** confirmed (dispatch).

**Pass 5 — narrowed / partially fixed-on-tree** (`bareaga_web-ky6` / `l4v`).
Stale catalog bullets (120s lease, missing `maxDuration`, per-item watermark
RPC, unchunked GitHub, `after()` re-auth) are **gone**:

- `leaseTtlSeconds` default **300** (`destinationWorker.server.ts`).
- `MAX_ITEMS_PER_TICK = 100`.
- GitHub `GITHUB_TREE_CHUNK_SIZE = 500` + `base_tree`.
- Batch `record_delivery_outcomes`.
- `maxDuration = 300` on sync, manual sync, **and** cron.
- F-27: `sync/route.ts` captures `ownerId` before `after()` (no cookie re-auth).

**Stands:**

- Primary near-real-time trigger is still `after()` on archive sync. Connect /
  OAuth do not start a tick; the user must Sync now, save something, or wait
  for cron.
- Catch-up: Hobby cron once a day (`vercel.json` `0 6 * * *`). Sub-daily cron
  *fails at deploy time*. Cron serializes **every** active destination in one
  300s sweep with no owner cap (S2-3). A 5,000-item first connect needs 50
  successful ticks; if only cron fires, that is 50 days.
- Notion: sequential `await` per dirty item (~3 req/s). 100-item cap keeps a
  tick inside the lease; drain still depends on later `after()` / Sync now /
  tomorrow's cron.
- `destination_delivery_attempts` is append-only and never pruned.
- Duplicate-page risk from lease TTL < run time is **largely removed**
  (TTL = budget and 100-item cap). Residual: any adapter that creates before
  it can persist `externalRef`. F-31 (title-only PATCH) is a different bug
  and is **fixed-on-tree**.

The worker *domain* (leases, min-interval, watermarks, stop-on-auth-error,
`httpRetry`) is **solid**. Inngest (`bareaga_web-m31`) does not replace that
domain. Cheap levers in this finding are on tree; remaining work is drain /
start-on-connect / Hobby catch-up. Vercel-native alternatives for the
decision record: **Workflows**, **Queues**.

**Pass 4 platform notes (still true):** default `maxDuration` 300s on every
plan; Hobby cron once/day; GitHub tree 100k / 7 MB / ~40 MiB body; Notion
~3 req/s. §7.11 (timed 100-item run) still open — it sizes headroom, it is
not required to keep the cap.

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

**Pass 5 (S1-3 / S1-4 merged here, not new ids):**

- `handleArchiveExport` `Response.json`s `{ current, revisions, contentSnapshots }`
  — same 4.5 MB GET hole, extra payload. `handleArchiveRevisions` calls
  `store.export()`, which still loads `archive.current` then returns only the
  revision list.
- `checkArchiveBudget` runs in `archiveSyncStore.server.ts` `sync()` only.
  `LocalStorageArchiveRepository.save` migrates; it does not enforce the
  ceiling. Anonymous users never hit the server reject. Client cap should be
  ≤ min(4.5 MB, measured localStorage headroom) after §7.7.

#### F-04 · Archive list mounts every matching card; `indexOf` is O(n²)

**Tag:** launch at hundreds of items; **scale** at the 5,000 ceiling ·
**Confidence:** confirmed.

**Pass 5 — narrowed / partially fixed-on-tree.** On tree now:

- `RESULTS_PER_PAGE = 100` + `visible.slice(0, renderLimit)` show-more.
- `itemPositions` `Map` (no `data.items.indexOf`).
- Lazy `PostPublishPanel` (not mounted until open).

**Remaining:** the list is still **document-scrolled**; show-more can walk to
5,000 cards; sidebar `itemCountIn` is collections × items on every render
(**scale** under 2,000 × 5,000); each mounted card still embeds a full
collections `<select>` (F-34). `ARCHIVE_BUDGET.maxItems = 5_000` is a
pre-launch *ceiling*, not observed load. Virtualization (`bareaga_web-w3p`) is
still a tool, not step one — remaining cheap levers are a tighter mount cap
and not cloning 2,000 `<option>`s per row.

#### F-05 · Persistence queue writes every snapshot, not only the latest

**Tag:** launch as archives grow · **Confidence:** confirmed, including tests.

**Pass 5 — narrowed / partially fixed-on-tree.** Catalog “writes every
snapshot / `saved === [1, 2]`” is **stale**. `PersistenceQueue.enqueue` now
coalesces to `this.pending` (`persistenceQueue.ts`); tests assert a burst
saves only the latest (`[3]`, or in-flight + two more → `[1, 3]`).

**Remaining:** each *actual* `repository.save` still runs full
`migrateArchiveData` (`new URL()` per item) + `JSON.stringify` of the whole
archive + `operationsForChange`, which `JSON.stringify`s every field of every
entity (`syncedArchiveRepository.ts`). Queue persist is a second full
`JSON.stringify(this.queue)`.

`ArchiveContext` lives on the root layout (`src/app/layout.tsx` →
`AppProviders`). A star clones the items array and re-renders every archive
subscriber, including chrome that only needed `savedArticleIds` (`SiteHeader`
`useArchive()` for `items.length` + persistence — S7-1 merged here). Unguarded
queue persist after advancing `this.last` is F-33.

#### F-06 · `fetchValidatedHttps` buffers the whole body with no streaming cap

**Status:** fixed on the working tree — `receivedBytes` vs `maxBytes`, destroy
on overflow (`safeOutboundFetch.server.ts`). Dedicated
`safeOutboundFetch.server.test.mjs` now exists (S3 / S9). Do not reopen.

**Tag:** launch (function memory) · **Confidence:** confirmed.

Was: concatenating `data` chunks with no max; callers checked `Content-Length`
then `arrayBuffer()` size; missing `Content-Length` meant download-until-timeout.
SSRF/DNS-pinning/manual-redirect revalidation was already **solid**. Do not
replace this module with a generic HTTP client. Media uploads remain F-28.

#### F-07 · Revision retention is the union of 50 revisions and 30 days

**Status:** fixed on the working tree (`bareaga_web-jc1`) —
`20260909170000_cap_archive_revision_retention.sql` replaces AND with OR:
delete when `revision <= cutoff OR created_at < now()-keepDays`, never the
current revision. pgTAP `archive_quotas_retention.test.sql`. Do not reopen.

**Tag:** launch cost if anyone syncs continuously · **Confidence:** confirmed.

Was: prune only when `revision <= current - 50` **and** older than 30 days
(`20260907160000`). Catalog AND-text and the `archiveBudget.ts` “whichever is
larger” comment are **stale**; README retention row may still say keep last 50
**and** last 30 days. Worker still calls `prune_all_archive_revisions`, which
delegates to the replaced function. JSONB scan cost of `archive_storage_stats`
is F-35.

#### F-31 · Notion updates PATCH title only (body stays at create text)

**Status:** fixed on the working tree (`bareaga_web-dcr.2`). Create is
unchanged (POST `properties` + `children`). Update PATCHes title, then
rewrites the first paragraph via `PATCH /blocks/{id}` or appends
`bodyBlocks` when that child is missing. `notionAdapter.test.mjs` covers
create vs update payload. Not F-02.

**Tag:** launch · **Confidence:** confirmed.

#### F-32 · Collection follow write/read skip the visibility cut

**Status:** fixed on the working tree (`bareaga_web-dcr.3`). `follow()` loads
the live publication and requires `actorCanReachTarget` (canSee toward the
owner; unpublished → 404, unseeable → 403). `listFollowed` filters with
`filterFollowedCollections` before loading items: public/unlisted stay
(FollowButton), private and followers-tier drop unless the viewer still
clears canSee (owner, or profile-follower of a followers-tier collection).
RLS WITH CHECK on `collection_follows` is unchanged (defence-in-depth). Do
not reopen as isListable — unlisted must remain on GET followed. Payload/
truncation of the same endpoint is F-01 remainder (S5-2), not this leak.

**Tag:** launch · **Confidence:** confirmed.

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

**Pass 5 — narrowed / partially fixed-on-tree.** `buildArticleSlashItems` is
gated `trim.length >= 3` and `/[a-z]/i` (`slashCommands.ts`); tests assert
`"a"` builds nothing.

**Remaining:** `SiteHeader` still passes a **new `context` object** every
render. `SlashMenu` `useMemo` depends on that identity. Once the gate opens,
build and fuzzy score still walk every headline. `NewsApp` also writes the
full `currentSources` array into `ChromeProvider` on every feed batch.

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
`priority`, `unoptimized`. File is **1,381,709 bytes** (`public/coeus_logo.png`).
Root layout also loads five `next/font/google` families (self-hosted, so CSP
`font-src 'self'` is consistent). Tag later; LCP cost is real but not a
5k / Notion / popular-profile launch blocker.

#### F-33 · Sync-queue persist is unguarded after a successful local save

**Tag:** scale (demoted from launch; §7.7 unmeasured) · **Confidence:** confirmed.

`SyncedArchiveRepository.save` (`syncedArchiveRepository.ts`):
`await this.local.save(data); this.last = data;` then `persistQueue()` /
`publishState()` with no try. `persistQueue` is
`store.setItem(QUEUE_KEY, JSON.stringify(this.queue))`. A `QuotaExceeded`
after advancing `this.last` means `operationsForChange` on retry is empty —
pending ops die on reload. Real near 8 MiB snapshot + queue; folk localStorage
~5 MiB is unmeasured (§7.7), so not launch.

**Fix shape:** wrap queue/state `setItem`; on quota, surface error without
advancing `this.last` past durable ops — or write archive+queue together.

#### F-34 · Each mounted archive card embeds a full collections `<select>`

**Tag:** scale at `maxCollections` × mount cap · **Confidence:** confirmed.

Inside `ArchiveList` `renderedItems.map`, `data.collections.map` → `<option>`
per collection. Closed `<details>` stay in DOM. 100 × `maxCollections`(2,000)
= 200k option nodes at budget; tens of collections is fine. Distinct from
remaining F-04 (per-row explosion, not virtualization).

**Fix shape:** one shared `<datalist>` / combobox, or options only when the
row's collection picker is open.

#### F-42 · Keyword-rules textarea parses and writes prefs on every keystroke

**Tag:** later (was launch; Ranked is opt-in) · **Confidence:** confirmed.

Settings ranking textarea `onChange` → `parseKeywordRules` → `updatePrefs`
(`SettingsPanel.tsx`). Default `homeView` is `"grid"` (`prefs.ts`) — Ranked
is opt-in. Sibling of F-08, not a search-bar clone. Disk debounce is 200 ms;
React is not.

**Fix shape:** parse on blur, or debounce the parse the same way as disk.

#### F-43 · Root `AppProviders` hydrates archive + prefs on public routes

**Tag:** later · **Confidence:** confirmed.

`RootLayout` wraps every route (`layout.tsx`); `useArchiveProvider` calls
`repository.load()` on mount. `/about`, `/u/[handle]`, `/c/[slug]` still
hydrate localStorage archive + start `synchronize()` for signed-in visitors.
Fine at small archives; extra work on every public hit.

**Fix shape:** lazy archive provider on `/archive` and signed-in chrome, or
skip `synchronize()` until an archive mutation / `/archive` visit.

---

### Server / social (mostly bounded, still heavy)

#### F-12 · Profile overview still does the fat load on every tab

**Tag:** scale for a popular profile · **Confidence:** confirmed.

**Pass 5 — narrowed / partially fixed-on-tree.** Tab-gates
`listOwnedPublications` (overview) and `pageOwnedPublications` /
`pageByAuthor`. **Gone:** always-on `listByAuthor` cap 500.

**Still always** when the section is on: `listRepostsByActor` 100, likes 100,
replies 50 + children, then `followsAmong` + `threadDescendantCounts`; plus
follow counts (F-01 / S4-1). Identity load is request-`cache()`d with metadata
(good). Catalog “always parallel-loads listOwned + listByAuthor” is stale.

#### F-13 · `thread_descendants` LIMIT is on the outer SELECT, not inside the CTE

**Tag:** scale for a viral thread · **Confidence:** confirmed.

**Pass 5 — narrowed: SQL fixed-on-tree; `childrenOf` remains.**
`20260910100000_thread_root_key.sql` replaces the recursive CTE with a
`thread_root_id` index scan + LIMIT. `thread_descendant_counts` is GROUP BY,
uncapped aggregation (not recursive).

**Remaining:** `childrenOf` uses one global `.limit(200)` across **all**
parent ids (`conversationProfileStore.server.ts`). Fifty roots share 200
children; later threads starve. Dedicated thread page exists for overflow
(S6-1 merged here). F-41 is a different hole (`hasMore` before derive).

#### F-14 · Following feed: unbounded follow graph + offset merge

**Tag:** scale · **Confidence:** confirmed.

**Pass 5:** followee id list is now `readAllPages` (F-01 truncation patched).
Offset merge + `.limit(offset+limit+1)` remain (`followedFeed.server.ts`).
`boundedOffset` accepts any integer ≥ 0 (`discover/page.tsx`); at offset ≥ 1000
PostgREST `max_rows` can still truncate a `.limit(cap)` that is not `.range()`
(S6-3).

**Visibility sentence inverted (S6 wins):** catalog “short page while
`hasMore` is true” is **stale**. `combineFollowedFeed` filters with
`isListable` then slices; `hasMore` is `visible.length > offset+limit`
(`followedFeed.ts`). Remaining failure: `listFollowedPeopleContent` `.limit(cap)`
with **no vis predicate**, then filter-after-cap — private newest rows starve
older public ones (S6-2). Posts-tab cousin is F-40, not this table.

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
`maxDuration`. Default reader asks for on the order of **22** enabled sources.
HN enrichment fans out up to 50 Firebase calls; `hnMetricsCache` is an
**unbounded** `Map` (`engagement.server.ts`). Refresh budget
(`feedRefreshGuard.server.ts`) is process-local (80 sources / 60s per IP).
CDN `s-maxage=90` only helps after a success. Unauthenticated cache-miss
fan-out (not on that budget) is F-38. §7.12 unmeasured — do not treat cold
TTFB as a ship-blocker number.

#### F-17 · Admin client + application-layer visibility is intentional

**Tag:** solid, with a footgun · **Confidence:** confirmed.

`lock_down_public_tables` + service role + `canSee` / `canSeeIndirect` /
`deriveProfileView` is the product security model, not a missing RLS policy.
The footgun is any new reader that uses the admin client and **forgets** the
derive layer. **Was live: F-32** (collection follow write/read) — now
fixed-on-tree (`bareaga_web-dcr.3`).
Pass-4 sampled `/c/[slug]` / RSS / discover remain clean. Conversation create
path does gate `actorCanReachTarget` (`conversationApi.ts`). Keep this
pattern; do not “fix” it by putting PostgREST in the browser.

#### F-35 · `archive_storage_stats` seq-scans every revision JSONB

**Tag:** scale · **Confidence:** confirmed (function shape; empty-stats EXPLAIN).

`archive_storage_stats` (`20260907160000`) `sum(octet_length(r.snapshot::text))`
over all revisions plus a correlated count of `archive_operations`. Weekly
`capture_storage_growth` calls it in-process (`max_rows` does not apply).
Empty-stats EXPLAIN: Seq Scan `archive_revisions`; SubPlan Seq Scan
`archive_operations` per archive. OR-cap (F-07) still keeps up to
`keepRevisions` of 8 MiB JSONB per archive. Not a user request path.

**Fix shape:** persist `snapshot_bytes` on `archive_revisions` at insert;
aggregate that. Needs EXPLAIN ANALYZE on a multi-revision fixture (§7.2).

#### F-40 · Posts-tab pages can render empty while `hasMore` is true

**Tag:** later · **Confidence:** confirmed.

`pageByAuthor` loads all tiers, keyset, `limit+1` (`postPublicationStore.server.ts`);
`derivePostCards` then `isListable`. Comment already says a page may render
shorter than limit. Cousin of F-14, posts not Following — do not merge.
Stranger + newest-private slice: short page, `hasMore` true.

**Fix shape:** push the same vis filter `countVisibleByAuthor` already uses
into `pageByAuthor`.

#### F-41 · Thread `hasMore` is computed before the visibility derive

**Tag:** later · **Confidence:** confirmed.

Reader `hasMore = descRows.length > limit` on the raw RPC
(`conversationProfileStore.server.ts`); loader forwards `page.hasMore` after
`deriveThreadView` drops invisible descendants (`threadPageLoader.server.ts`).
Mixed-tier after the target is opened. Not F-13 (pagination SQL is fixed).

**Fix shape:** recompute `hasMore` from derived rows, or push the vis
predicate into `thread_descendants`.

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

**Pass 5 — stands, partially mitigated.** `file.size` + magic-byte `slice`
run before the second `arrayBuffer()`; the handler still
`await request.formData()` first (`profileMediaApi.ts`). Product caps are
2 MB avatar / 5 MB cover (`MEDIA_SIZE_CAP`). Cover 5 MiB is above Vercel’s
hard 4.5 MB body cap (S4-3 merged here) — a first user with a 4.6 MB cover
gets platform 413. F-06 streaming cap does not apply to this FormData path.

#### F-20 · Profile media: magic bytes + size caps; CSP `img-src` is `https:`

**Status:** CSP half **fixed-on-tree**; upload residual is F-28. Catalog
`img-src … https:` blanket is **stale**.

**Tag:** solid upload path; later CSP tightness · **Confidence:** confirmed.

`profileUpload.ts` sniffs PNG/JPEG/WebP, caps 2 MB / 5 MB. API still
`request.formData()` then validates (F-28). CSP (`securityHeaders.ts`) is now
`img-src 'self' data: blob:` + `https://*.supabase.co` + configured origin
(unit `securityHeaders.test.mjs` rejects a bare `https:`). Residual: the
wildcard is still **any** Supabase project, not only `NEXT_PUBLIC_SUPABASE_URL`.
`script-src 'unsafe-inline'` is documented as required for Next bootstrap.
Keep this finding as historical + F-28 pointer; do not reopen the blanket
`https:` claim.

#### F-21 · `robots.ts` disallows `/u/` but canonical profiles are `/@handle`

**Tag:** later (SEO) · **Confidence:** confirmed; crawler behavior **inferred**.

Disallow includes `/u/`, `/archive/`, `/api/`. Canonical URLs are `/@handle`
(rewrite in `next.config.ts`). Crawlers that honor canonical may still index
profiles; those that request `/u/...` will not. Public collections `/c` are
allowed. Profile `generateMetadata` still has no `robots.index` (collections
do, from visibility). Confirm whether `/@handle` should be indexable (§7.13).

**Pass 5 (S10-3 merged here):** Disallow entries are trailing-slash prefixes
(`/signin/`, `/welcome/`, `/archive/`). Next `trailingSlash` is unset; app
routes are `/signin`, `/welcome`, `/archive`. Google prefix match: `/signin/`
does **not** match `/signin`. `/u/` and `/api/` still match children. Fix
shape: Disallow `/signin`, `/welcome`, `/archive` (keep `/u/`, `/api/`);
independently decide `/@`. Preview Allow `/` is F-51.

#### F-22 · Public pages are `force-dynamic` by design

**Tag:** later (TTR / cost) · **Confidence:** confirmed.

`/@handle`, `/c/[slug]`, `/discover` are `dynamic = "force-dynamic"` because
visibility depends on the viewer. CDN caching public-only variants is a
product decision, not a missed `cacheLife`. Do not “fix” this without a
private-by-default story.

**Pass 5 (S5-4 merged here):** `/c` index is also `force-dynamic` then only
calls `listPublic` (SQL `visibility='public'`). Viewer-independent; discover
API already sends `Cache-Control: public, max-age=60`. Footnote, not a new id.

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
`ipv4IsUnsafe`. Fixtures belong in `safeOutboundFetch.server.test.mjs` (that
file now exists — F-06 / §5).

#### F-36 · Corrupt local archive is replaced with demo data in memory

**Tag:** later (was launch) · **Confidence:** confirmed.

`localArchiveRepository.load` catch returns `createDemoArchive()` without
copying raw bytes aside; `migrateArchiveData` invalid shape/items returns
`{ data: createDemoArchive(), valid: false }`. Contrast: `readQueue` copies
unusable queue JSON to `coeus.archive.sync-queue.v1.corrupt`. Disk is **not**
overwritten on parse fail (`valid && migrated` guard). Data loss needs a
subsequent `save`. localStorage `setItem` is typically atomic — truncated-write
as a first-user path is unshown.

**Fix shape:** same preservation path as the sync queue; do not hand demo data
to `save` without an explicit reset.

#### F-37 · Failed delivery at the current field revision is treated as caught-up

**Tag:** later (was launch) · **Confidence:** confirmed (comparator); production
hit-rate inferred.

`computeDirtyItems` upserts when `!delivery || revision > lastDeliveredRevision`
and ignores `status` (`destinationDelivery.ts`). Failed insert writes
`last_delivered_revision = 0`. Hole is **rev-0 items** after a failed first
push. `applyArchiveSyncBatch` typically leaves saved items at ≥ 1, so a first
Notion connect of a starred archive is unlikely to hit rev-0. Comparator still
real. Not F-02.

**Fix shape:** dirty if no delivery, or `status` in
`{failed_retryable, failed_auth, pending}`, or `revision > lastDeliveredRevision`.
Test: fail upsert at rev 0 → still dirty.

#### F-38 · Unauthenticated `/api/feeds` cache-miss is not on the refresh budget

**Tag:** later · **Confidence:** confirmed (code); impact inferred (no live QPS).

`consumeRefreshBudget` runs only `if (query.forceRefresh)` (`feedApi.ts`).
Adjacent to F-16 (cold UX), not the same (unbudgeted miss fan-out). Unique
query-string URLs churn `BoundedCache(250)`. Preview always budgets.

**Fix shape:** budget cache-miss as well as force-refresh, or cap unauthenticated
fan-out separately.

#### F-39 · Dotted IPv4-mapped literals are classified unsafe (fail-closed parser hole)

**Tag:** later · **Confidence:** confirmed (parser); Node returning this form
**inferred**.

`ipv6Groups` requires hex hextets, so `::ffff:8.8.8.8` → null → unsafe
(`safeOutboundFetch.server.ts`). Fail-closed sibling of F-30, opposite
direction — do not merge (F-30 is too-permissive ranges).

**Fix shape:** accept dotted IPv4-mapped/compatible in `ipv6Groups`, then run
the embedded v4 through `ipv4IsUnsafe`. Keep fail-closed on parse junk.

#### F-44 · F-29 default-privilege lockdown is `postgres`-role only

**Tag:** later · **Confidence:** confirmed.

`ALTER DEFAULT PRIVILEGES FOR ROLE postgres` only
(`20260909150000_lock_down_public_functions.sql`). Live dump: `supabase_admin`
defacl still grants EXECUTE/ALL to anon. Do not reopen F-29 as launch. A
future dashboard/SQL-editor object created as `supabase_admin` becomes
PostgREST-callable by the publishable key.

**Fix shape:** matching `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`;
pgTAP over `pg_default_acl`.

#### F-45 · `notion_oauth_states` and `storage_growth_snapshots` have no RLS

**Tag:** later · **Confidence:** confirmed.

Neither migration `ENABLE ROW LEVEL SECURITY`. OAuth table `REVOKE ALL` from
anon/authenticated; growth table GRANT `service_role` only. Closed by GRANT,
not RLS. Destinations tables use RLS-with-zero-policies as the tighter pattern.

**Fix shape:** `ENABLE RLS` (zero client policies) on both.

#### F-46 · Identity sequence USAGE remains granted to anon/authenticated

**Tag:** later · **Confidence:** confirmed.

Identity on `storage_growth_snapshots`; no `REVOKE … ON SEQUENCES` in
migrations (F-29 asked to consider it). Live USAGE to anon is dump-only. Anon
still cannot INSERT. `nextval()` gap/DoS only.

**Fix shape:** `REVOKE USAGE, SELECT ON ALL SEQUENCES` + default privileges
from anon/authenticated/public; pgTAP `has_sequence_privilege` count = 0.

#### F-47 · Several list indexes omit the keyset tiebreaker

**Tag:** later / scale (index work; needs loaded EXPLAIN) · **Confidence:**
confirmed (empty-stats EXPLAIN).

`collection_publications_live_idx (visibility, published_at desc)` — listPublic
Incremental Sort on `id`. `replies_parent_idx (parent_id)` — `childrenOf`
Sort `created_at`; `replies_author_live_idx` lacks `id`.
`destination_deliveries_status_idx (destination_id, status)` — deliveries
ORDER BY `item_id` sorts after bitmap. Contrast: `20260909120000` already added
`id` to posts/owner-collection page indexes.

**Fix shape:** add `id` (and `created_at` on `parent_id`) to match the bt0
keyset indexes. Do before treating as a ship item — §7.2.

#### F-48 · `log-alerts` fail-closes without `VERCEL_TOKEN`

**Tag:** later · **Confidence:** confirmed.

`scripts/log-thresholds.mts` `fetchLogLines` `process.exit(2)` if no token.
`.github/workflows/log-alerts.yml` always runs the check. Contrast
`storage-growth.mts`, which skip-greens. Unpinned `npx vercel@latest logs`.
§7.15 remainder (S9-3). Whether the GitHub secret exists is a dashboard fact.

**Fix shape:** fail-open until the secret exists (mirror storage-growth); pin
the Vercel CLI; optional secret bead like `bareaga_web-9hc`.

#### F-49 · Playwright always boots `next dev` with the test-session backdoor armed

**Tag:** later (coverage around F-26; does not reopen F-26) · **Confidence:**
confirmed.

`playwright.config.ts` `webServer.command` is `npm run dev`;
`webServer.env.E2E_TEST_LOGIN = "1"`. CI e2e job runs that suite; the quality
job's `next build` is unused by e2e. No spec asserts 403 when the flag is off
or `NODE_ENV=production`. A production-gate regression still gets a green e2e
job (the suite cannot run unless the backdoor is armed).

**Fix shape:** keep armed e2e on `next dev`; add a unit/negative probe of
`testLoginEnabled()` fail-closed.

#### F-50 · Proxy auth redirect drops cookies written during `getClaims` refresh

**Tag:** later (was launch; same class as F-27, different site) ·
**Confidence:** confirmed code path; whether `getClaims` Set-Cookies on that
hop **inferred**.

`src/proxy.ts` `setAll` rebuilds `response` with `cookies.set`; on
`decideProxyRedirect` the handler `return NextResponse.redirect(to)` without
copying that jar. Signed-in `/signin` → `/welcome`; signed-out `/welcome` →
`/signin`. Drop is confirmed **if** `setAll` ran. Not a 5k / Notion /
popular-profile blocker. F-27 is fixed on the sync route; do not reopen it.

**Fix shape:** copy `response.cookies` onto the redirect `NextResponse` (or
redirect via the same response object).

#### F-51 · `robots.ts` always allows `/` — no preview/non-prod disallow

**Tag:** later · **Confidence:** confirmed.

`robots.ts` always `allow: "/"`. `docs/deployment.md` claims a non-production
`NEXT_PUBLIC_SITE_URL` disallows all crawling — **no such branch exists**.
Preview `*.vercel.app` emits Allow `/`. Adjacent to F-21 / §7.13.

**Fix shape:** if `VERCEL_ENV !== "production"` (or SITE_URL not the apex)
return Disallow `/`; keep production rules. Or `X-Robots-Tag: noindex` on
preview.

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
pgTAP via `supabase start` + `supabase test db`. **E2E is a CI job** (`e2e`
on PRs and `main`: supabase start + `npm run test:e2e`). `bareaga_web-ubj.4`
(delivery assertion) is the remaining journey gap; parent ubj may still be
open in historical text.

**Glob hole (S9-1, not a new F-id):** `test:unit` is still
`src/lib/*.test.mjs` — nested `src/lib/feeds/*.test.mjs` would never run
(and `src/lib/feeds/feeds.server.ts` has no test today). Zero nested
`*.test.mjs` exist today, so CI is not currently dropping files. `src/hooks/`
is not collected; `test:ui` is `src/components/*.test.tsx` (same class).
Fix: widen to `src/lib/**/*.test.mjs` and add `src/hooks/**/*.test.*`. (§7.14)

**Unit/UI that exist and matter:** archive sync/validation/budget/API,
destination delivery/worker/secrets/OAuth state, conversation derive + API,
profile store pagination tests, feed contract/query/discovery, safe *feed*
fetch (injected fetcher), **`safeOutboundFetch.server.test.mjs` (streaming
cap)**, persistence queue (**coalescing** saves), interaction (slash trap,
mobile settings, account menu happy path), `securityHeaders.test.mjs`.

**Production logic with no dedicated test file** (not exhaustive; some is
covered indirectly):

| Module | Why it matters |
|---|---|
| `safeContentFetch.server.ts` | capture path |
| `destinationsStore.server.ts` | F-01 remainder / worker store |
| `collectionPublicationStore.server.ts` | F-15; F-32 vis cut is on tree (API tests + filter helper) |
| `followedFeed.server.ts` | F-14 |
| `profileFollowStore.server.ts` | F-01 counts |
| `feeds/feeds.server.ts` | cold cache, HN fan-out |
| `feedRefreshGuard.server.ts` | process-local budget |
| `slashCommands.ts` | F-09 residual (lib gate is tested) |
| `localArchiveRepository.ts` | F-36 corrupt-load / quota |
| `NewsApp.tsx` / `ArchiveList.tsx` / `StoryFeed.tsx` | F-04 remainder, F-08, F-10, F-34 |
| `src/proxy.ts` | F-50 cookie-copy on redirect (helper is tested) |

**E2E today:** `e2e/auth.spec.ts`, `profile.spec.ts`, `public.spec.ts`,
`routes.spec.ts`, **`archive.spec.ts`** (star → GET `/api/archive` → reload),
`destinations.spec.ts` (Notion OAuth mock connect), `preview.spec.ts`.
`profile.spec.ts` covers follow, 308 canonical handle, visibility revocation,
feed/thread cursors. Missing: delivery tick, quota/corrupt archive, export
size, media upload (CI supabase start excludes `storage-api`), F-26 fail-closed
path (F-49). Playwright `trace: "retain-on-failure"` but CI never uploads
artifacts (S9-2, §7.15 — not a new F-id).

**Observability:** `/api/health` (config + `archives` exact count), uptime
workflow, log-threshold workflow, storage-growth workflow (secret bead
`bareaga_web-9hc`). Health `count: exact` on `archives` is a possible
unnecessary sequential scan (later). Config probe does not assert destination /
cron / Notion OAuth env (S9-4, §7.15 — not a new F-id). Log-alerts fail-closed
without `VERCEL_TOKEN` is F-48.

---

## 6. Relationship to existing Beads

| Bead | Pass 0 framing | This document |
|---|---|---|
| `bareaga_web-w3p` | Introduce `@tanstack/react-virtual` | F-04 remainder + F-34. Problem is still unbounded archive DOM / per-row `<option>`s. Map/lazy panel/100-card page are on tree; library is still step 4 after a tighter cap. |
| `bareaga_web-kbt` | Adopt React Aria Components | F-18. Fix AccountMenu keys; keep `useModalDialog`. |
| `bareaga_web-m31` | Evaluate Inngest | F-02 remainder (Hobby daily drain / start-on-connect). Cheap levers (lease 300, 100/tick, GitHub 500, batch watermarks, `maxDuration`) are **on tree**. Decision record vs Vercel Workflows/Queues. |
| `bareaga_web-ubj.*` | E2E journeys | `archive.spec.ts` and destinations connect exist; delivery tick (`ubj.4`) and F-26 fail-closed (F-49) do not. |
| `bareaga_web-7c0` | Closed library audit | Keep the keep-as-is section; do not treat its ranking as the plan. |
| `bareaga_web-dmm` | Security envelope | **Closed.** F-19/F-23–F-27/F-29 on the working tree, not committed. Do not reopen as new design. Residuals: F-44 (defacl), F-49 (e2e gate untested), F-50 (proxy cookies). |
| `bareaga_web-dcr.2` | — | F-31. **Fixed-on-tree.** Notion update rewrites the first paragraph. |
| `bareaga_web-dcr.3` | — | F-32. **Fixed-on-tree.** Collection follow write/read apply `canSee`. |

Do **not** file a markdown TODO for F-01–F-51. When a finding is accepted as
work, create or retitle a bead that names the *problem*, not the vendor.

Pass 4 also reframes `bareaga_web-m31` again: the Vercel-native durable-workflow
options (**Workflows**, **Queues**) should be the baseline in that decision
record, with Inngest as one external alternative — and the cheap levers in F-02
are already on tree. Remaining F-02 is drain, not another cap.

---

## 7. Remaining research

Pass 4 status per item, with pass 5 tree notes. **Answered** items no longer
block a plan; **open** items still need a live system or a product decision.
EXPLAIN / localStorage / deploy timing / `@handle` indexing are **not**
answered — no live measurement happened in pass 5.

1. **Hosted PostgREST `max_rows`.** *Answered.* Supabase hosted default is
   **1,000**, same as `config.toml` (settable in Project Settings → API → Max
   Rows). `service_role` bypasses **RLS, not `db-max-rows`** — the cap is a
   PostgREST response limit applied to every role, RPC `RETURNS TABLE`
   included. F-01 stands: every unbounded service-role read is silently
   truncated at 1,000. Fix with explicit `.range()` pagination or by moving
   aggregation into SQL (`count`, embedded `(count)`). Pass 5: several listed
   reads are now paged; residual unbounded paths are in the F-01 table.
2. **EXPLAIN.** *Open — needs the DB.* Requires `supabase db` access or a prod
   read replica. Do before F-01/F-12/F-13/F-15/F-35/F-47 index work; not a
   blocker for the security envelope, F-31, F-32, or the persistence/list
   leftovers. Empty-stats EXPLAIN on F-35/F-47 is not ANALYZE.
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
   (`recursive`); undocumented ~40 MiB request-body cap. Pass 5: worker sends
   ≤100 dirty items/tick; adapter chunks at 500 with `base_tree`. A 5,000-note
   first sync is no longer one tree. See F-02.
6. **Notion rate limits.** *Answered.* ~3 req/s per connection + per-workspace
   limits; 429 with `Retry-After`; payload 500 KB / 1000 blocks (adapter sends
   one block — fine). Sequential per-item delivery of a few hundred items is
   now capped at 100/tick (lease TTL 300). Body-on-update is F-31 (fixed-on-tree), not rate.
7. **localStorage quota.** *Open — needs a browser test.* ~5 MiB is the folk
   number; the real cap and eviction behaviour with prefs + op queue + archive
   together needs a measured run in Chrome/Safari/Firefox. Blocks the F-03
   budget-alignment number (pick ≤ 4 MiB only after confirming the client can
   hold that + the queue).
8. **Admin-client visibility cut.** *Answered for the sampled page paths;
   one live footgun.* Pass 4 `/c/[slug]` / RSS / discover remain clean. Pass 5
   S5 found `follow()` / `listFollowed()` skip `canSee` — **F-32**, now
   fixed-on-tree.
   A full sweep of remaining call sites + an ESLint/pgTAP guard is still
   worth doing (F-17); opportunistic next to F-32, not a blocker for it.
9. **IPv6 transition ranges.** *Answered — it's a gap.* Promoted to **F-30**.
   Fail-closed dotted-mapped parser hole is F-39 (later, do not merge).
10. **Function `EXECUTE` grants.** *Answered — blanket revoke is on tree
    (F-29, `dmm.6`).* Residual default-privileges for `supabase_admin` is
    F-44 (later). Sequence USAGE is F-46. Do not reopen F-29 as launch.
11. **First-connect timing vs lease.** *Open — needs a timed run.* Cheap fix
    (TTL 300, 100/tick) is **on tree**; the measurement now sizes drain
    headroom and Hobby cron finish, not whether to cap. Do not treat as
    answered — no timed 100-item run happened.
12. **Feed cold-start wall time.** *Open — needs a deploy.* `/api/feeds` has no
    `maxDuration` (→ 300s), 6s per-feed timeout, concurrency 8, ~22 default
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
    (`bareaga_web-4po`/`a2n`) and the **`test:unit` glob hole** (S9-1): it globs
    `src/lib/*.test.mjs`, so a future `src/lib/feeds/*.test.mjs` (or anything
    under `src/hooks/`) silently never runs. `src/lib/feeds/feeds.server.ts`
    has no test at all today. Small bead: widen the glob to `src/lib/**/*.test.mjs`.
    Not minted as an F-id — catalog remainder.
15. **CI gaps.** *Open — low effort, do alongside E2E work.* Playwright trace
    upload on failure (S9-2, not an F-id); `log-alerts.yml` `VERCEL_TOKEN`
    fail-close is F-48; health probe missing destination/cron/OAuth env is
    S9-4 (not an F-id). F-49 is the e2e-always-dev hole around F-26.

**Still genuinely blocking a full PR plan:** only items 2, 7, 11, 12 (each
needs a live DB, browser, or deploy) and item 13 (a product decision). The
security envelope (§8 items 1–7) is already on the working tree. F-31 and
F-32 need none of those measurements.

---

## 8. Draft sequencing (not accepted)

Order for when we *do* plan. Problems, not packages. This section is **still
not an accepted plan**.

Security envelope first — **all seven are done on the working tree** (epic
`bareaga_web-dmm`, closed). They still need a commit/PR; do not reopen them as
design. Cheapest-first, historical:

> **Progress (2026-09-11):** envelope items 1–7 remain **on the working tree,
> not committed** — `bareaga_web-dmm.1`–`.6` plus F-06/F-07 (not dmm). Pass 5
> did not reopen F-19/F-23–F-27/F-29. Residuals are later: F-44 (defacl),
> F-49 (e2e gate untested), F-50 (proxy cookies), F-20 wildcard `*.supabase.co`.

1. **F-23** — **fixed-on-tree.** `resolveFeedUrl` `fetcher` default `undefined`.
2. **F-19** — **fixed-on-tree.** `safeInternalPath` at all three call sites.
3. **F-27** — **fixed-on-tree.** `ownerId` captured before `after()`.
4. **F-26** — **fixed-on-tree.** `NODE_ENV` + `@e2e.coeus.local`. Negative
   e2e/unit is F-49.
5. **F-25** — **fixed-on-tree.** Host pin in validator; CHECK https+uuid.
6. **F-24** — **fixed-on-tree.** BFF-only writes; bucket MIME + size.
7. **F-29** — **fixed-on-tree.** Blanket `REVOKE EXECUTE` + postgres defacl.
   Residual F-44.

Then launch leftovers that pass 5 actually kept (filed as beads):

7a. **F-32** — **fixed-on-tree.** `follow()` / `listFollowed()` apply
   `actorCanReachTarget` / `filterFollowedCollections`. RLS WITH CHECK kept.
7b. **F-31** — **fixed-on-tree.** Update rewrites/appends `bodyBlocks`; create unchanged.

Then performance/correctness (some wait on §7 items 2/7/11/12):

8. Limit or page remaining unbounded PostgREST reads (F-01 remainder:
   collection `listFollowed`, profiles `listFollowed`). Destination
   `deliveries()` is **already paged**. Needs EXPLAIN (§7.2) only for index
   choices (F-47), not for `.range()` calls.
9. F-02 **remainder:** Hobby daily catch-up + start-on-connect + drain
   (50 ticks / 5k items). Cheap levers (lease 300, 100/tick, GitHub 500,
   batch watermarks, `maxDuration`) are **on tree**. **"Cron more often" is
   off the table on Hobby** — if near-real-time catch-up matters, that is a
   Pro upgrade or a Vercel Workflow/Queue (`bareaga_web-m31`).
10. Persistence leftovers: field-wise stringify diffs, debounce `lastSearch`
    (F-05 remainder, F-08), unguarded queue persist (F-33). Coalescing is on
    tree; tests already expect latest-only.
11. Archive list leftovers: tighter mount cap, per-row `<option>`s (F-04
    remainder, F-34). Index map and lazy publish panel are on tree.
12. Align the snapshot budgets (F-03): set `maxSnapshotBytes` ≤ 4 MiB (after
    §7.7 confirms client headroom) **or** stream `GET /api/archive` (and
    export).
13. Media upload streaming / cover vs 4.5 MB (F-28). `fetchValidatedHttps`
    byte cap is **on tree** (F-06).
14. Stabilize slash `context` identity (F-09 remainder). Article-command gate
    is on tree.
15. Skip unused profile tab queries (F-12 remainder); `childrenOf` per-parent
    cap (F-13 remainder). Thread CTE LIMIT is on tree.
16. AccountMenu keyboard (F-18). Header image (F-11). `/@handle` robots (F-21,
    F-51, after the §7.13 product call).
17. Only then: virtualization, RAC, Query, Zod, Inngest/Workflows — if the
    problem they solve is still visible.

The security envelope (items 1–7) is **code-complete on the tree**; it still
needs a commit. F-31 and F-32 are **fixed-on-tree**. Performance
work should wait on EXPLAIN (§7.2) and a localStorage measurement (§7.7) for
the parts that need a number; F-02 drain and F-04/F-05 leftovers can start
without those.

---

## 9. Document maintenance

- Append a row to §1 when a pass closes or overturns a finding.
- Change a finding in place; do not leave contradictory copies.
- When a finding ships, mark **Status: shipped** on the finding and point at
  the bead/PR. Do not delete evidence.
- If this file and a bead title diverge, retitle the bead to the problem.
