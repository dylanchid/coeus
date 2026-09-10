# Deployment

Coeus deploys as a single Next.js App Router project on Vercel, backed by one
Supabase project (Postgres + Auth + private Storage). This document lists the
required configuration and the rollback procedure.

## Required environment variables

Set these in the Vercel project (Production, and Preview where noted). Values
come from the Supabase dashboard and each third-party integration. See
[`.env.example`](../.env.example) for the annotated list.

### Build-time, public (safe to expose to the browser)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key (browser Auth + profile-media Storage only) |
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS origin, e.g. `https://coeuscoeus.com`. Drives canonical URLs, `robots.txt`, `sitemap.xml`. A non-production value makes `robots.ts` disallow all crawling. |

### Server-only secrets (never prefixed `NEXT_PUBLIC_`)

| Variable | Purpose |
|---|---|
| `SUPABASE_SECRET_KEY` | Service-role key. The BFF is the only path to application tables. |
| `DESTINATION_TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64. AES-256-GCM key for destination secrets at rest. |
| `DESTINATION_OAUTH_STATE_SECRET` | Signs/binds the Notion OAuth `state`. |
| `NOTION_OAUTH_CLIENT_ID` / `NOTION_OAUTH_CLIENT_SECRET` | From the Notion integration. |
| `NOTION_OAUTH_REDIRECT_URI` | Must exactly match the Notion integration's redirect URI (use `localhost`, not `127.0.0.1`, for local). |
| `CRON_SECRET` | Exact name required — Vercel only attaches `Authorization: Bearer $CRON_SECRET` to Cron requests for this name. Protects `/api/archive/destinations/worker`. |
| `COEUS_PREVIEW_OPTOUT_DOMAINS` | Optional comma/whitespace-separated publisher domains that must never receive static screenshot previews. A configured domain also covers its subdomains; use this to action verified removal requests. |
| `SUPABASE_AUTH_GITHUB_*`, `SUPABASE_AUTH_GOOGLE_*` | Only for local `supabase start`; the hosted project sets these in its Auth dashboard. |

Rotating `DESTINATION_TOKEN_ENCRYPTION_KEY` invalidates every stored destination
secret — users must reconnect. Rotate only with a planned migration.

## Database

Migrations are forward-only SQL in [`supabase/migrations`](../supabase/migrations).

```bash
supabase link --project-ref <ref>
supabase db push          # apply pending migrations to the linked project
supabase test db          # pgTAP suite (CI also runs this)
```

The `db push` step is **not** automated by the Vercel deploy — run it before
promoting a build that depends on a new migration.

## Vercel configuration

- [`vercel.json`](../vercel.json) declares the daily cron
  (`/api/archive/destinations/worker`, `0 6 * * *`) that catches up destination
  delivery and runs the revision-retention and conversation-orphan sweeps.
- Node version is pinned by [`.nvmrc`](../.nvmrc).
- Static source previews use Playwright Chromium in the Node runtime. Before enabling
  them in Production, deploy with a Chromium-capable runtime (and include the matching
  browser binary). If the renderer is unavailable, `/api/article-preview` deliberately
  returns no image and Reader falls back to source metadata rather than weakening the
  publisher-policy or outbound-network controls.
- CI (`.github/workflows/ci.yml`) must be green: `npm test`, `tsc --noEmit`,
  `lint`, `build`, `npm run audit:ci`, and the Supabase pgTAP suite.

## Deploy flow

1. Merge to `main`. CI runs the full gate.
2. Vercel builds a Production deployment from `main`.
3. If the change includes a migration, `supabase db push` **first**.
4. Post-deploy smoke against the live origin:
   ```bash
   SMOKE_BASE_URL=https://<origin> npm run smoke:security-headers
   SMOKE_BASE_URL=https://<origin> npm run smoke:health
   ```
5. Confirm monitoring (below) is green.

## Monitoring

**Uptime (active).** `.github/workflows/uptime.yml` polls `/api/health` and `/`
every ~15 min. A failure fails the workflow run → GitHub emails the repo owner
and sends a mobile push. Optional: add an `ALERT_WEBHOOK_URL` repo secret
(Settings → Secrets and variables → Actions) pointing at a Slack or Discord
incoming webhook to also post there.

**For real paging, add a dedicated monitor** (2 minutes, free tier):

- **BetterStack** (betterstack.com/uptime) or **UptimeRobot** (uptimerobot.com)
- New monitor → HTTP → `https://coeuscoeus.com/api/health`
- Check interval 1–3 min; expect HTTP `200`; add keyword match on `"status":"ok"`
  so a `503 degraded` also alerts
- Notify by email / SMS / Slack; set a 2-minute confirmation window so a single
  blip doesn't page

**Error-rate / latency alerts.** The `serverLog.ts` boundary emits one JSON line
per critical operation (`route`, `operation`, `durationMs`, `statusClass`,
`correlationId`) and `*.error` lines on failure. Route Vercel's runtime logs to
a log platform (Vercel → Project → Observability, or a Log Drain to
BetterStack/Datadog/Axiom) and build alerts from the thresholds in the README
"Observability" section. Until a drain is set up, the uptime probe above is the
only automated alert.

## Rollback

**Application code** — use Vercel's instant rollback: promote the previous
Production deployment (Vercel dashboard → Deployments → previous → "Promote to
Production", or `vercel rollback <deployment-url>`). This is safe whenever no
migration shipped with the bad deploy.

**Database** — migrations are forward-only; there is no `db push --down`. To undo
a schema change, write a new compensating migration and apply it, then roll the
app forward. A deploy that pairs a destructive migration with code should be
staged so the code tolerates both schemas across the rollback window.

**Destination delivery** — the durable per-destination lease
(`acquire_destination_delivery_lease`) means a rolled-back or crashed worker
releases its lease on TTL expiry; no manual cleanup is required.

**Sync rate limit / quotas** — tunable via the constants in
[`src/lib/archiveBudget.ts`](../src/lib/archiveBudget.ts); a code deploy is the
only way to change them, so a rollback restores the previous limits.

## Accepted deferred risks

- The server feed cache and forced-refresh limiter (`feeds.ts`,
  `feedRefreshGuard.server.ts`) are process-local. Horizontal scaling beyond one
  instance needs these moved to shared infrastructure.
- Structured instrumentation currently covers the highest-value routes; the
  remaining API routes are tracked for follow-up instrumentation.
