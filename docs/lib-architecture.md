# `src/lib` architecture

Status: accepted (2026-09-09). Defines `bareaga_web-4po`. This note describes
the intended shape of `src/lib`; the code does not fully match it yet. Modules
move toward it **opportunistically, in small reviewable slices** — there is no
flag-day directory rewrite.

## Why

`src/lib` is ~160 files in one flat namespace. The clusters are already obvious
from the filenames (`archive*`, `profile*`, `feed*`, …) but nothing records the
allowed dependency direction or the server/browser boundary, so new work has no
clear home and server-only code can drift toward client bundles.

## Layers

Every module sits in exactly one layer. **Imports only ever point down this
list**, never up.

| Layer | Suffix / shape | May import | Rules |
|---|---|---|---|
| **5 · route wrappers** | `src/app/api/**/route.ts` | domain API, primitives | Wire deps, `instrument()`, delegate. No logic. |
| **4 · domain API** | `*Api.ts` | own domain core + store *interfaces*, primitives | Request → Response. Deps injected (`{ authenticate, store }`). Pure enough to unit-test without a server. |
| **3 · domain store** | `*.server.ts`, `*Store.server.ts` | own domain core, primitives, `supabase.server` | Supabase-backed IO. `import "server-only"` **unless** a `*.test.mjs` imports it — then drop the guard and leave a comment saying why (see the `server-only-vs-node-test` bead memory). |
| **2 · domain core** | plain `*.ts` in a domain | own domain, primitives, **another domain's core types only** | Pure: no `server-only`, no `next`, no Supabase. Domain logic, validation, and the public-safe derive functions (`deriveProfileView`, `conversationProfile`, …). |
| **1 · primitives** | shared `*.ts` | other primitives only | No domain imports. |

Primitives today: `visibility`, `types`, `httpRetry`, `fixedWindowBudget`,
`serverLog` / `deliveryLog`, `securityHeaders`, `safeOutboundFetch.server` /
`safeContentFetch.server` / `safeFeedFetch.server`, `supabase.client`,
`supabase.server`, `oauthState.server`, `clientCache`, `persistenceQueue`,
`healthCheck`, `logThresholds`, `storageCleanup`, `prefs`, `proxyRedirect`.

## Domains

| Domain | Modules (prefix) | Purpose |
|---|---|---|
| **archive** | `archive*`, `syncedArchiveRepository`, `localArchiveRepository`, `syncFailure` | The synced archive: repositories, immutable revisions, recovery, export, validation, budget. |
| **publications** | `collectionPublication*`, `post*`, `postPublication*`, `publicProfile` | Publishing collections and posts; the owned-item derive layer. |
| **conversations** | `conversation*`, `engagement*` | Replies, likes, reposts, and their indirect-visibility derive. |
| **profiles** | `profile*`, `profileFollow*`, `followListPage.server`, `publicProfile` (shared with publications) | Profile identity, handles, follow graph, media, sections, tabs. |
| **feeds** | `feed*`, `feeds`, `followedFeed*`, `ranking`, `sources`, `sourcePreview*`, `search`, `summary`, `slashCommands`, `fuzzy` | RSS ingestion, discovery, caching, ranking, the followed-feed view. |
| **destinations** | `destination*`, `notion*`, `obsidian*`, `deliveryLog`, `shareDestination` | Outbound delivery of the archive to Notion / Obsidian. |

### Allowed cross-domain edges

Only these, and only against the other domain's **core types** (layer 2), never
its store or API:

- `conversations` → `publications` (a reply/like/repost targets a collection or post)
- `profiles` derive → `publications` + `conversations` (profile tabs render owned + interaction cards)
- `feeds` (`followedFeed`) → `profiles` (follow graph) + `publications` (published collections)
- `destinations` → `archive` (delivers archive revisions)

A domain must not import another domain's `*.server.ts` or `*Api.ts`. If you
need one, the thing you need is a core type — lift it.

## Server / browser safety

- `*.server.ts` carries `import "server-only"` so a client import fails at build
  time. Exception: a module a `*.test.mjs` imports drops the guard (the
  strip-types test runner executes `server-only` for real) and says so in a
  comment. Pure orchestration logic that tests want stays importable.
- Client-safe modules import a `.server` module **type-only** (`import type …`)
  or not at all.
- `supabase.client.ts` for the browser/RSC-safe anon client; `supabase.server.ts`
  for the admin client + `requiredEnvironment`. Never the reverse.

## Where new work goes

1. Pure logic for an existing domain → `<domain><Thing>.ts` next to its siblings.
2. Supabase reads/writes → `<domain><Thing>Store.server.ts` implementing an
   interface the API layer depends on.
3. A new HTTP endpoint → `<domain><Thing>Api.ts` (the handler) + a thin
   `src/app/api/.../route.ts` wrapper with `instrument()`.
4. Something every domain needs, with no domain imports → a primitive.
5. A genuinely new domain → add a row above in the same PR.

## Moving existing modules

- One domain-slice per PR; never a bulk rename.
- Keep a re-export shim at the old path only if the import fan-in is large;
  delete it in a follow-up.
- Each slice must keep `npx tsc --noEmit`, `npm run lint`, and `npm test` green.
- An ESLint import-boundary rule to enforce the layer/domain edges mechanically
  is a follow-up (`bareaga_web` — see 4po follow-ups).
