# Bareaga handoff

## Workspace

- Path: `/Users/dylanchidambaram/bareaga_web`
- Stack: Next.js 16.2 App Router, React 19, TypeScript, `rss-parser`, and `@dnd-kit`
- Product: standalone RSS reader inspired by brutalist.report; do not scrape it or claim affiliation
- Work tracking: Beads (`bd ready`, `bd show <id>`, `bd update <id> --claim`)

Before changing Next.js code, read the relevant installed guide under `node_modules/next/dist/docs/`; this repository’s framework version may differ from remembered APIs.

## Current product surfaces

- `/`: Reader. Grid groups stories by source; Top balances sources; Focus orders newest-first; Ranked applies inspectable user rules.
- `/discover`: Source catalog, filtering, ratings, and enabled-source management.
- `/archive`: Local archive, notes, reading state, collections, Markdown/CSV export.
- `/social`: Local preview of sourced posts and community collections.
- `/product`: Product explanation and roadmap.
- `/api/feeds`: Validated, rate-limited RSS aggregation route.

## State and persistence

`src/components/AppProviders.tsx` owns preference loading/saving, theme attributes, archive loading/saving, and cross-tab archive updates. Reader, Discover, Archive, Social, and ShareSheet consume its hooks; route components must not call `localStorage` directly.

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

The next synced-archive feature should implement the existing repository interface and swap the provider configuration rather than changing screens.

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
- `src/styles/product.css`
- `src/styles/discover.css`
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

- Preferences and archives are local-first; authenticated cross-device sync is future work.
- The server feed cache and refresh limiter are process-local. A horizontally scaled deployment should move both policies to shared infrastructure.
- Publisher feeds may fail or rate-limit independently; errors remain per-source and non-fatal.
- RSS stays server-side to avoid browser CORS and keep provider code out of client bundles.
- `next.config.ts` pins the Turbopack root to this repository.

Last updated: 2026-08-05.
