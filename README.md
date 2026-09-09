# Coeus

Coeus is a standalone, local-first RSS reader for building a deliberate reading stack. It combines source discovery, configurable feed views, transparent personal ranking, a portable archive, and sourced social sharing in a sparse editorial interface.

It is inspired by [brutalist.report](https://brutalist.report/) and is not affiliated with it.

## Run locally

Use the Node version in [`.nvmrc`](.nvmrc) (Node 24; `nvm use`). Then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For a production check:

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run lint
npm run build
npm run audit:ci
```

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request
and every push to `main`. Two jobs must pass before merge (mark them required in
branch protection):

- **quality** — `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`
  (unit + jsdom UI), `npm run build`, and `npm run audit:ci` (fails on `high`+
  advisories). The build receives only public, non-secret placeholder
  `NEXT_PUBLIC_*` values; no production secret is present in CI.
- **database** — pins the Supabase CLI (`2.75.0`), runs `supabase start` (Docker
  is preinstalled on GitHub-hosted `ubuntu-latest`; migrations apply on start),
  then `supabase test db` for the pgTAP suite.

Node is pinned via `.nvmrc` and consumed by `actions/setup-node`
(`node-version-file`). To reproduce CI locally you need Docker Desktop running.

## Routes

| Route | Purpose |
|---|---|
| `/` | Reader with Grid, Top, Focus, and opt-in Ranked views |
| `/sources` | Search, filter, rate, add, and remove reading sources |
| `/discover` | Shared collections, sourced articles, and links from people |
| `/archive` | Saved articles, notes, tags, collections, search, and export |
| `/u/[handle]` | Public profile (+ `/followers`, `/following`); owner-console affordances inline |
| `/c`, `/c/[slug]` | Public collection listing and pages (+ `/c/[slug]/rss.xml`) |
| `/signin`, `/welcome`, `/auth/callback` | Passwordless account flow (optional; anonymous use is unaffected) |
| `/about` | Concise guide to the product and its core sections |
| `/social`, `/product` | Legacy redirects to `/discover` and `/about` |
| `/api/feeds` | Validated server-side RSS aggregation endpoint |
| `/api/archive`, `/api/archive/sync` | Authenticated archive retrieval and transactional synchronization |
| `/api/collections/*`, `/api/posts/*`, `/api/profiles/*`, `/api/replies`, `/api/reposts`, `/api/likes`, `/api/account/*` | Authenticated JSON boundaries for publications, the person graph, and account management |
| `/api/health` | Unauthenticated readiness (`GET`) and liveness (`HEAD`) probe |

## Architecture

```text
src/
  app/                         Next.js routes and the feed route handler
  components/                  Route applications and shared UI
    AppProviders.tsx           Composition shell: usePreferencesProvider + useArchiveProvider
    PrimaryNav.tsx             Shared application navigation
  hooks/
    useFeedQuery.ts            Reader feed lifecycle
  lib/
    feedContract.ts            Public API query validation
    feedApi.ts                 Testable HTTP response/cache policy
    feeds.ts                   Server-only RSS cache and aggregation
    engagement.server.ts       Server-only provider enrichment
    feedQuery.ts               Browser batching and progressive merge
    prefs.ts                   Validated local preference store
    archiveTypes.ts            Archive contracts and repository interface
    archiveDomain.ts           Pure archive operations
    archiveFixtures.ts         Seeded local demo data
    archiveValidation.ts       Runtime validation and migrations
    localArchiveRepository.ts  Browser persistence adapter
    archiveSync.ts             Versioned operations and conflict reducer
    archiveApi.ts              Authenticated HTTP boundary
    archiveSyncStore.server.ts Supabase transaction adapter
  styles/
    base.css                   Tokens, themes, fonts, and document defaults
    reader.css                 Reader, settings, search, and feed views
    archive-social.css         Archive, sharing, and social surfaces
    product.css                About page
    discover.css               Sources directory
    responsive.css             Cross-feature responsive overrides
```

[`docs/lib-architecture.md`](docs/lib-architecture.md) defines the intended
`src/lib` shape — the six domains (archive, publications, conversations,
profiles, feeds, destinations), the five layers (route → API → store → core →
primitives) and the allowed dependency direction, plus where new work goes.
Modules move toward it in small slices, not a flag-day rewrite.

The root provider is the only UI integration point for preferences, theme hydration, and archive persistence. Screens mutate archives through a typed repository boundary; the wired repository is `SyncedArchiveRepository`, so a signed-in browser gets authenticated background sync on top of `localStorage` without any route component changing.

The feed endpoint validates and deduplicates inputs, rejects unknown sources and topics, rate-limits forced refresh fan-out, and marks server-only RSS/provider modules explicitly. Ordinary responses expose short public cache headers; forced refreshes and errors are `no-store`.

Destination delivery (Obsidian/GitHub, Notion) runs from three overlapping
triggers — the post-sync `after()` hook, the manual "sync now" route, and the
daily cron sweep. Each destination is guarded by a durable lease
(`acquire_destination_delivery_lease`) that gives both cross-instance mutual
exclusion (so two runs can't create duplicate Notion pages) and a
cross-invocation rate limit via a minimum interval between runs. Outbound
adapter requests carry per-request timeouts and bounded retry/backoff. A
delivery failure is captured in a structured, correlation-id-tagged log and
never fails or delays the archive sync response.

## Local data

- Preferences: `coeus.prefs.v1`, with migration from `bareaga.prefs.v1` and, before that, `brp.prefs.v1`.
- Archive: `coeus.archive.v1`, with migration from `bareaga.archive.v1`; runtime-validated and migrated on read.
- Feed responses: short browser-session cache plus a process-local server cache.

Archive exports remain portable Markdown and CSV. The authenticated sync API,
durable schema, and the browser adapter (`SyncedArchiveRepository` — durable
operation queue, background retry/rebase, first-account migration) are all
implemented. Anonymous users stay entirely on local storage.

## Limits and retention

Per-account budgets are enforced at the database boundary (a trigger on the
immutable revision table) and mirrored by the service-role sync store for
clearer errors. Defaults live in [`src/lib/archiveBudget.ts`](src/lib/archiveBudget.ts)
and are meant as generous pre-launch ceilings, not usage shaping:

| Budget | Default | Enforced by |
|---|---|---|
| Items / collections / posts per archive | 5000 / 2000 / 5000 | `archive_revisions_budget` trigger + `checkArchiveBudget` |
| Serialized snapshot size | 8 MiB | same |
| Any single string field | 20000 chars | `checkArchiveBudget` |
| Sync requests per account | 60 per 5 min | `consume_archive_sync_budget` (durable, cross-instance); `429` + `Retry-After` |
| Sync batch body / operations | 2 MiB / 500 ops | `handleArchiveSync` / `parseArchiveSyncBatch` |
| Revision retention | keep last 50 **and** last 30 days | `prune_all_archive_revisions`, run by the daily cron route |

`archive_storage_stats()` reports per-archive revision counts, byte totals, and
operation counts for monitoring storage growth.

## Observability

[`src/lib/serverLog.ts`](src/lib/serverLog.ts) is the structured-logging
boundary. `instrument({ route, operation, correlationId }, fn)` wraps a critical
server operation and emits one JSON line with `route`, `operation`,
`durationMs`, `statusClass` (`2xx`/`4xx`/`5xx`/`error`), and a `correlationId`
(taken from `x-request-id` / `x-vercel-id` when present). A `redact()` pass and
`scrubMessage()` keep secrets, tokens, JWTs, private notes, captured content,
and raw personal data out of the logs; client responses are unchanged. Every
API route handler is wrapped in `instrument()` (`bareaga_web-cnu`).

`GET /api/health` is the readiness probe (`HEAD` is liveness, always 200). It
checks required configuration and Supabase reachability and returns
`{ status: "ok" | "degraded", checks, durationMs }` with `200` when every check
passes and `503` otherwise. The body is only names, booleans, and durations —
no identifiers or error messages. Verify a running server with
`npm run smoke:health` (honors `SMOKE_BASE_URL`).

### Alerting

**Uptime — in place now.** [`.github/workflows/uptime.yml`](.github/workflows/uptime.yml)
probes `https://coeuscoeus.com/api/health` (and `/`) every ~15 min; a failure
fails the run, which emails the repo owner and pushes to GitHub mobile. Set an
`ALERT_WEBHOOK_URL` repo secret (Slack or Discord incoming webhook) to also get
a chat message. GitHub's scheduler is best-effort — for sub-minute paging add a
dedicated monitor (see `docs/deployment.md`).

**Log-based thresholds — backstop in place now.**
[`.github/workflows/log-alerts.yml`](.github/workflows/log-alerts.yml) pulls the
last ~30 min of production runtime/request logs from Vercel every ~30 min,
evaluates the table below with [`src/lib/logThresholds.ts`](src/lib/logThresholds.ts),
and fails the run on any **Page** breach (email + GitHub mobile, plus
`ALERT_WEBHOOK_URL` when set); **Warning** breaches print but keep the run
green. Rate signals have a minimum-sample floor so one error on a quiet route
can't read as 100%. Run it locally against a window with
`npm run check:log-thresholds` (`VERCEL_TOKEN` env, or `--input <file>` of
JSON-lines). Required repo secret: `VERCEL_TOKEN`; optional `VERCEL_PROJECT`,
`VERCEL_TEAM_ID`.

This is a short-polling safety net — a real log platform (Vercel Observability,
or a Log Drain to BetterStack / Axiom / Datadog) with sustained-window alerting
on the same `serverLog.ts` events is still the recommended primary.

| Signal | Warning | Page | Backstopped |
|---|---|---|---|
| `GET /api/health` non-200 | any, 1 sample | sustained > 2 min | ✅ |
| `*.error` log rate (any route) | > 1% of that route's requests over 15 min | > 5% over 5 min | ✅ |
| `archive.sync` `5xx` rate | > 2% over 15 min | > 10% over 5 min | ✅ |
| `archive.sync` p95 `durationMs` | > 2000 | > 5000 | ✅ |
| `destination_delivery.*.error` | > 5 in 1 h | > 50 in 1 h | ✅ |
| `archive_storage_stats` total `snapshot_bytes` growth | > 25%/week | > 100%/week | ⛔ needs week-over-week state (yg4 follow-up) |

## Local Supabase

Install the Supabase CLI and Docker Desktop, then run:

```bash
supabase start
supabase db reset
supabase test db
supabase status -o env
```

Copy the URL, publishable/anon key, and service-role key into a local `.env.local`
using [`.env.example`](.env.example). `SUPABASE_SECRET_KEY` is server-only and
must never use a `NEXT_PUBLIC_` prefix. The database migration creates immutable
archive revisions, operation idempotency records, owner-only RLS policies, and a
private `archive-snapshots` bucket.

## Adding a built-in source

Edit [`src/lib/sources.ts`](src/lib/sources.ts) and provide the full `SourceDef` metadata. Source IDs are validated by `/api/feeds`; adding a catalog entry does not silently enable it for existing users.

## Deployment

Required secrets, database migration steps, the deploy flow, and rollback
procedure are in [`docs/deployment.md`](docs/deployment.md).

## Project workflow

This repository uses Beads for durable work tracking. Run `bd ready` to see unblocked work and `bd show <id>` for acceptance criteria.
