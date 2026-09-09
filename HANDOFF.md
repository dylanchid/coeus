# Coeus handoff

**This file is the authoritative current engineering status.** When another
document (`README.md`, `docs/PRD.md`, `docs/*-plan.md`) disagrees with the
"Current status" section below about what is built, this file wins; the others
are product intent, architecture decisions, or historical plans and are labelled
as such.

## Workspace

- Path: `/Users/dylanchidambaram/Coeus` (Turbopack root is pinned here in `next.config.ts`)
- Stack: Next.js 16.3 App Router, React 19, TypeScript, `rss-parser`, `@dnd-kit`, and `@supabase/ssr`
- Product: standalone RSS reader inspired by brutalist.report; do not scrape it or claim affiliation
- Work tracking: Beads (`bd ready`, `bd show <id>`, `bd update <id> --claim`); issue ids are `bareaga_web-<id>` (an earlier `coeus_web-` prefix appears in some historical text)

## Current status (2026-09-09)

- **Reading, sources, ranking, archive, export** — fully real and local-first, no account required.
- **Accounts + synced archive** — shipped (`bareaga_web-6j1`, closed 2026-09-04). Passwordless Supabase Auth; `SyncedArchiveRepository` is the wired repository, so a signed-in browser gets authenticated background sync with a durable local operation queue. Anonymous use stays local-only.
- **Public collections** — shipped (`bareaga_web-5bv`, closed 2026-09-04). `/c` listing and `/c/[slug]` pages with curator notes, attribution, owner-controlled visibility, RSS output, and signed-in follow/unfollow.
- **Profiles + person graph + posts/replies/reposts/likes** — shipped (`bareaga_web-nfq` phases 1–4, 2026-09-07). Public profile at `/u/[handle]` with `followers`/`following` pages; owner-console affordances inline via an `isOwner` flag.
- **Observability** — structured `serverLog` boundary on every API route; `/api/health` probe; uptime + log-threshold GitHub Actions alerting (`bareaga_web-yg4`).
- **Open near-term work** — see `bd ready`. UI-orchestration extraction (`bareaga_web-cqi`), `src/lib` domain-folder moves (`bareaga_web-a2n`), Playwright E2E (`bareaga_web-ubj`), notifications (`bareaga_web-80m`).

Before changing Next.js code, read the relevant installed guide under `node_modules/next/dist/docs/`; this repository’s framework version may differ from remembered APIs.

## Current product surfaces

- `/`: Reader. Grid groups stories by source; Top balances sources; Focus orders newest-first; Ranked applies inspectable user rules.
- `/sources`: Source catalog, filtering, ratings, custom feeds, and enabled-source management.
- `/discover`: Shared links, sourced posts, and community collections.
- `/archive`: Archive, notes, reading state, collections, Markdown/CSV export — local-first, background-synced when signed in.
- `/u/[handle]`: Public profile (+ `/followers`, `/following`); owner sees the same page with inline edit/visibility affordances.
- `/c` and `/c/[slug]` (+ `/c/[slug]/rss.xml`): Public collection listing and pages.
- `/signin`, `/welcome`, `/auth/callback`: Passwordless auth flow (optional; anonymous use is unaffected).
- `/about`: Compact explanation of the product.
- `/social` and `/product`: Permanent legacy redirects.
- `/api/feeds`: Validated, rate-limited RSS aggregation route.
- `/api/archive/*`, `/api/collections/*`, `/api/posts/*`, `/api/profiles/*`, `/api/replies`, `/api/reposts`, `/api/likes`, `/api/account/*`: authenticated JSON boundaries, each wrapped in `instrument()`.

## State and persistence

`src/components/AppProviders.tsx` is the root UI integration point for preferences and archive state. It is a composition shell over two hooks: `usePreferencesProvider()` (`src/components/usePreferencesProvider.ts` — preference load/save, theme/layout dataset attributes, debounced write-back) and `useArchiveProvider()` (`src/components/useArchiveProvider.ts` — archive load, cross-tab subscription, the durable `PersistenceQueue`, sync state, `replaceArchiveFromServer`). Reader, Sources, Discover, Archive, and ShareSheet consume `usePreferences()` / `useArchive()`; route components must not call `localStorage` directly.

Preferences use `PrefsStore` in `src/lib/prefs.ts`. Archive persistence is replaceable through `ArchiveRepository` in `src/lib/archiveTypes.ts`:

```text
UI intent
  → useArchive / usePreferences
  → pure domain update
  → ArchiveRepository or PrefsStore
  → current localStorage adapter
```

Archive responsibilities are deliberately separated:

- `archiveTypes.ts`: contracts and repository interface
- `archiveDomain.ts`: pure mutations such as saving an article
- `archiveFixtures.ts`: demo seed
- `archiveValidation.ts`: runtime validation and v1 migrations
- `localArchiveRepository.ts`: browser storage adapter
- `archiveExport.ts`: Markdown and CSV portability

The synced-archive foundation is specified in `docs/synced-archive-architecture.md`.
It selects optional Supabase passwordless auth, Postgres revisions/operations, and
private Storage snapshots. `src/lib/archiveSync.ts` defines and validates sync v1
and provides the reference field-level conflict reducer. The executable database
and RLS schema is in `supabase/migrations/20260904120000_synced_archives.sql`.
Authenticated `GET /api/archive` and `POST /api/archive/sync` handlers use a
Supabase SSR session boundary and a service-role transaction adapter. The database
RPC locks the archive, performs compare-and-swap revision commits, records
idempotency results, and retains immutable recovery snapshots atomically. API
behavior is dependency-injected for tests and enforces ownership, 2 MiB/500-op
request bounds, no-store responses, and validated stored snapshots.

The browser adapter has landed (`bareaga_web-6j1`, closed 2026-09-04):
`SyncedArchiveRepository` (`src/lib/syncedArchiveRepository.ts`) implements the
`ArchiveRepository` interface over the local repository plus a durable operation
queue with background retry/rebase and a first-account migration path. It is the
repository `AppProviders` configures. Anonymous users still never hit the network.

## Feed architecture

- `feedContract.ts`: validates bounds, topics, IDs, duplicates, and supported parameters.
- `feedApi.ts`: dependency-injected route behavior and explicit response caching.
- `feedRefreshGuard.server.ts`: process-local per-client forced-refresh budget.
- `feeds.ts`: server-only RSS fetching, provider cache, concurrency, and stale revalidation.
- `engagement.server.ts`: server-only RSS/Hacker News enrichment.
- `engagement.ts`: browser-safe display formatting only.
- `feedQuery.ts`: bounded browser batching, independent failure handling, and progressive merging.
- `useFeedQuery.ts`: cancellation, retries, topic changes, and lifecycle state.

Cached columns must remain visible during background refresh, and one failed batch must not stop unrelated sources.

## Styling ownership

`src/app/globals.css` is an import manifest. Rules live in:

- `src/styles/base.css`
- `src/styles/reader.css`
- `src/styles/archive-social.css`
- `src/styles/product.css` (About)
- `src/styles/discover.css` (Sources)
- `src/styles/responsive.css`

Fonts are self-hosted through `next/font` in `src/app/layout.tsx`. The old Gallery UI has been removed; preference migration still maps legacy `gallery` values to Focus and must remain until that migration is intentionally retired.

## Validation

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run lint
npm run build
```

The test command covers feed contracts/orchestration, refresh limiting, archive validation/migrations, exports, ranking, and source preferences.

## Known boundaries

- Preferences and archives are local-first. The archive additionally syncs across devices for signed-in users; preferences do not sync yet (still roadmap).
- The server feed cache and refresh limiter are process-local. A horizontally scaled deployment should move both policies to shared infrastructure.
- Publisher feeds may fail or rate-limit independently; errors remain per-source and non-fatal.
- RSS stays server-side to avoid browser CORS and keep provider code out of client bundles.
- `next.config.ts` pins the Turbopack root to this repository.

Last updated: 2026-09-09.
