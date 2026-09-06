# Profile page at `/@handle` — implementation plan

**Status:** Accepted plan (2026-09-06). No code written yet.
**Owner:** Dylan Chidambaram
**Beads:** `bareaga_web-nfq` (epic) — see [Beads tree](#10-beads-tree) for the full id map
**Related:** [`PRD.md`](./PRD.md), [`synced-archive-architecture.md`](./synced-archive-architecture.md), the mockup artifact *The Coeus Profile*

---

## 1. What this is

A personal and public profile page served at `/@handle`, laid out like the SoundCloud
reference: a full-bleed cover with the name set over it, a square avatar overlapping the
lower-left, a tab + actions bar, then a tab-driven feed column on the left and a persistent
sidebar on the right.

One route serves both readers. To a visitor it is a curated directory. To the owner it is a
console — the same layout, an `Edit` affordance instead of `Follow`, inline visibility
controls, and a jump-off to every collection. There is no separate `/me`: an `isOwner` flag
(session `auth.uid()` vs. the profile row `id`) flips the affordances inline, the way
`ArchiveApp` already toggles inline `<details>` editors.

Tabs: `Overview · Collections · Posts · Reposts · Replies · Likes`. A tab with nothing
visible to the viewer is hidden for visitors and greyed for the owner.

**Coeus value to hold throughout:** private by default. The profile is an outward-facing
surface on a private-by-default product, so every new default is the more private one —
`posts.visibility` defaults to `private`, and the enum migration promotes nothing.

---

## 2. Three findings that overturned the original spec

The mockup's layout and product decisions hold. Its *phasing* did not survive contact with
the schema.

### Finding 01 — Posts have no server-readable home

`SocialPost` (`src/lib/archiveTypes.ts:33`) exists only inside `ArchiveData`, which is
persisted as one opaque JSON blob in `archive_revisions.snapshot` under owner-only RLS, and
authored client-side with `author: "You"` (`src/components/SocialApp.tsx:57`). `DiscoverApp`
renders posts from local state.

There is no `posts` table, and — more to the point — **no publish boundary for one**.
Collections earned their way onto a public page by passing through
`derivePublicationSnapshot()` (`src/lib/collectionPublication.ts:101`), which is where
`item.note`, `tags`, `state`, `starred` and `topic` get dropped. Posts have never crossed
that boundary.

So the spec's "Phase 1: Collections *and* Posts read from what's already published" is half
true. Collections can. **Posts move to Phase 2**, behind their own `derivePostSnapshot()`.

```
SHIPS TODAY   Archive ──▶ derivePublicationSnapshot() ──▶ collection_publications ──▶ /@handle
BLOCKED       Archive ──▶ archive_revisions.snapshot   ──╳ (private, owner-only RLS)
PHASE 2 ADDS  Archive ──▶ derivePostSnapshot()         ──▶ posts                  ──▶ /@handle
```

### Finding 02 — Publications carry no owner

`collection_publications` keys on `archive_id` only. Listing "@handle's collections" means
walking `profiles.id → archives.owner_id → archives.id → collection_publications.archive_id`
— three hops through a table whose RLS is owner-only, on the hot path of a public page, with
no supporting index.

**Phase 1 denormalizes `owner_id`** onto the publication row and indexes
`(owner_id, published_at desc) where unpublished_at is null`.

### Finding 03 — The visibility enum cannot be widened in place

`collection_publication_visibility` is `('unlisted', 'public')`. `ALTER TYPE … ADD VALUE`
cannot use the new value in the transaction that adds it, and Supabase runs each migration
file in one transaction.

So the four-value enum is a **new type plus a column swap with `USING`** — which also forces
`publish_collection()` to be dropped and recreated (its signature names the old type) and its
`revoke`/`grant` pair re-applied for the new signature. Highest-blast-radius migration in
this plan.

---

## 3. Decisions taken

Twelve questions resolved in the planning session of 2026-09-06. Two override the mockup
spec. Everything downstream assumes these.

| # | Question | Decision |
|---|---|---|
| 1 | Where does the Posts tab land, given it has no table? | **Phase 2**, behind its own derive boundary — *overrides spec* |
| 2 | Avatar and cover files — Vercel Blob or Supabase Storage? | **Supabase Storage**, new public `profile-media` bucket — *overrides spec* |
| 3 | Existing published collections when the enum lands? | Map 1:1, no prompt. New values are opt-in only |
| 4 | Does `show_followers` hide the number as well as the list? | **Both.** Owner still sees it, marked hidden |
| 5 | Does Overview interleave reposts and replies? | First-party only: own collections + own posts |
| 6 | Reply nesting depth? | **Two levels** — a reply and its direct responses; deeper flattens |
| 7 | Where do the owner's unpublished collections appear? | Greyed in the owner's own Collections tab |
| 8 | Followers/Following list — tab, panel, or route? | **Own routes**: `/@handle/followers`, `/@handle/following` |
| 9 | Can someone change their handle after onboarding? | **Yes**, with a redirect table — as a parallel strand |
| 10 | How does the person graph feed Discover? | In scope: a "Following" **view** (not a ranking boost), Phase 2 |
| 11 | What does the sidebar Posts figure count? | **What this viewer can see** — per-viewer filtered |
| 12 | Notifications in this effort? | Separate epic, filed and blocked on Phase 3 |

### Locked before the session (not relitigated)

- Person-level following: **yes**. `profile_follows` is the substrate for the `followers`
  visibility tier, not just a collection subscription.
- Likes **and** reposts are both in scope.
- One `visibility` enum — `private | followers | unlisted | public` — on collections, posts
  and reposts. Likes are **not** tagged per row; one `profiles.likes_visibility` setting
  governs the whole list.
- Cover: the owner chooses a generative default (seeded from the handle, IBM Plex Mono
  field) **or** an uploaded photo.
- `/@handle` via a `next.config.ts` rewrite → `src/app/u/[handle]/page.tsx` as canonical.
- "Repost with a note" = a **reply** (threaded), not a quote-post. Plain reposts carry no
  note; the `reposts` table has no body column, which is what enforces it.
- `followers` means **your** followers, not mutuals. `SocialPost.audience: "friends"` is
  retired.

---

## 4. Architectural rule for the whole effort

> **Every public read path gets a pure derive function, and its test asserts *absence*, not
> presence.**

`collectionPublication.test.mjs` already does this for collection items. The plan adds:

| Module | Phase | Boundary it owns |
|---|---|---|
| `src/lib/publicProfile.ts` | 1 | What a profile exposes to a given viewer |
| `src/lib/post.ts` | 2 | What a post exposes when published |
| `src/lib/visibility.ts` | 2 | `canSee(visibility, viewer)` — the 16-cell truth table |
| `src/lib/visibility.ts` | 3 | `canSeeIndirect()` — reposts and likes re-check their *target* |

All four are pure: no `server-only` import, no Supabase import, no `next` import. That is
what lets them be exhaustively tested under `node --test` with no database.

### Three gates, two kinds

A row passes three gates before it renders:

```
one row ──▶ canSee(row, viewer) ──▶ canSeeIndirect(target, viewer) ──▶ profile.show_* ──▶ render
             │  ENFORCED             │  ENFORCED (reposts/likes)      ┊  DISPLAY ONLY
             ▼                       ▼                                ▼
          dropped                 dropped                          hidden
       (leak if wrong)         (leak if wrong)                    (cosmetic)
```

`canSee` and `canSeeIndirect` are **security boundaries**. The `show_*` switches are a
**display preference** — they tidy a profile, they do not protect anything; anyone with
direct query access could still count. They live in a different module
(`profileSections.ts`) precisely so nobody mistakes a boolean column for a permission.
This distinction is recorded as risk R7.

---

## 5. Phase 1 — identity, route, published collections

**Goal:** `/@handle` serves a real, server-rendered profile to a stranger and to its owner,
showing identity and published collections. No new social graph, no new visibility model, no
new content types. Everything on the page is data the app can already publish.

### Migration — `2026…_profile_surface.sql`

| Change | Detail |
|---|---|
| `alter table profiles` | `avatar_url`, `cover_url` (null ⇒ generative), `location` (≤80), `links jsonb not null default '[]'`, `pinned_collection_slugs text[] not null default '{}'` |
| Constraints | `links` shape checked in the database (array, ≤5 entries, each `{label, url}` with `https?://`); `avatar_url`/`cover_url` must sit inside the `profile-media` public prefix |
| `alter table collection_publications` | add `owner_id`, backfill from `archives`, set not null, index `(owner_id, published_at desc) where unpublished_at is null` — Finding 02 |
| `publish_collection()` | sets `owner_id` on insert so it can never drift |
| Storage | new public `profile-media` bucket; `storage.objects` insert/update/delete policy restricts each account to its `<uid>/` prefix |
| pgTAP | `supabase/tests/profile_surface.test.sql`, mirroring `profiles.test.sql` |

No new index for handle lookups — `profiles.handle` is already unique. The existing
`profiles_touch_updated_at` trigger covers the new columns automatically.

### Pure lib

- **`src/lib/publicProfile.ts`** — the most important file in this phase.
  `deriveProfileView(profile, publications, viewer)` returns a `PublicProfileView`.
  `viewer` is an *explicit argument*, so owner-only rows are a deliberate input rather than
  the accident of a filter someone forgot. `profile.id` and the timestamps never cross.
  Figures are computed from what actually crossed, never from a raw count.
- **`src/lib/profileMedia.ts`** — `coverSeed(handle)` (FNV-1a) + `generativeCover()`
  (mulberry32 over a density ramp) + `avatarInitials()`. Deterministic, so the test is a
  fixture comparison.
- **`src/lib/profile.ts`** — grows `ProfileLink`, `validateProfileLinks()`, `LOCATION_MAX`.
  `HANDLE_PATTERN` and `BIO_MAX` untouched.
- **`src/lib/profileStore.server.ts`** — `resolveHandle(handle)` and
  `listOwnedPublications(profileId)`.

> **`resolveHandle` is a seam, not a convenience.** Every handle lookup in the codebase goes
> through it starting now, even though in Phase 1 it only does a `select` on
> `profiles.handle`. That single indirection is the *only* reason sub-epic 4 (handle changes)
> can land later without touching the page. It returns
> `{ profile, redirectFrom }`, with `redirectFrom` always `null` this phase.

### Route

```ts
// next.config.ts
async rewrites() {
  return [{ source: "/@:handle", destination: "/u/:handle" }];
}
```

**Spike this first** (task 1.1, 30-minute timebox). A bare `@` immediately preceding a path
parameter is an unusual path-to-regexp pattern. Per
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md`
a plain array applies at the `afterFiles` position — correct here, since nothing in `public/`
can shadow `/@something`. **Fallback:** do it in `src/proxy.ts` with `NextResponse.rewrite()`;
the proxy already runs on this path (its matcher excludes only `api`, `_next/static`,
`_next/image`, `favicon.ico` and image extensions) and already clones the URL for its
redirects.

`src/app/u/[handle]/page.tsx` copies the shape of `src/app/c/[slug]/page.tsx` exactly:
`force-dynamic`, a `cache()` loader shared with `generateMetadata`, `notFound()` on a missing
handle, `createAdminSupabaseClient()` for the public read, `authenticateArchiveRequest()` for
`isOwner`. Per the comment already in `/c/[slug]`, a thrown error must reach Next's error
boundary rather than being swallowed into 404.

**`<AppShell section="account">` — no change to the `AppSection` union.** `"account"` is
already a member in `PrimaryNav.tsx` with no `LINKS` entry, so the nav renders with nothing
highlighted, which is correct for a profile page.

Tabs are `?tab=` search params rendered server-side as links: shareable, crawlable, no client
island. Only `overview` and `collections` are live this phase; an unknown value falls back to
`overview` rather than 404ing.

### API & UI

- `PUT /api/account/profile` — same route, same handler, new fields.
- `POST /api/account/profile/media` — **new.** MIME allowlist *and* magic-byte check, size
  cap (2 MB avatar / 5 MB cover), writes under `<uid>/` via the user's own session so the
  storage policy applies, deletes the previous file. The allowlist and cap logic is extracted
  as a pure function so it is unit-testable.
- `ProfileBanner` / `ProfileSidebar` / `ProfileTabs` — server components, zero client JS.
- `ProfileEditor` — the one client island, following `ArchiveApp`'s `<details>` inline-editor
  pattern. Validates links with the *same* `validateProfileLinks()` the API uses, so client
  and server cannot disagree.
- `src/styles/profile.css` + one `@import` in `globals.css`. **Tokens from `base.css` only** —
  a profile page that ignores `data-theme` and `data-palette` is a bug.
- `AccountMenu.tsx` — "Edit profile" stops pointing at `/welcome` and points at `/@handle`.
  This is the change that makes the page discoverable to its own owner.

### Deliberately not in Phase 1

Person-follows, the visibility enum, posts, likes, reposts, replies, the `show_*` switches.

The Followers figure counts **collection** followers — an aggregate over this owner's
`collection_follows` rows — and is labelled as such, because that is genuinely what it counts
until Phase 2 replaces it.

### Exit criteria

A signed-out stranger can open `/@dylan`, see the cover, bio, links and every public
collection, and follow a link into `/c/<slug>`. The owner sees the same page with an Edit
affordance and their private collections greyed. A unit test asserts no private field crosses
`deriveProfileView`.

---

## 6. Phase 2 — visibility model, person graph, posts

**Goal:** the largest phase and the one everything downstream waits on. Three migrations that
must land in order, plus the first content type Coeus publishes outside a collection.

### Migration A — the enum swap (highest risk)

Ordered steps, one transaction, one file, nothing else bundled in:

1. `create type public.visibility as enum ('private','followers','unlisted','public');`
   — order is least to most visible.
2. `add column visibility_new public.visibility`
3. `update … set visibility_new = visibility::text::public.visibility` — **1:1 map. Nothing
   becomes more visible.**
4. `set not null`, `set default 'unlisted'`
5. drop the two select policies referencing the old column; drop the old column; rename
6. recreate `collection_publications_live_idx` (dropping the column drops the index)
7. `drop function public.publish_collection(uuid, uuid, text, text,
   public.collection_publication_visibility, text, text, text, text, jsonb);` — the **full**
   old signature
8. recreate the function with `p_visibility public.visibility`, otherwise unchanged
9. **re-apply the `revoke` from `public, anon, authenticated` and the `grant execute` to
   `service_role` for the new signature** — a grant does not follow a signature change
10. recreate the two select policies
11. `drop type public.collection_publication_visibility;` — last

Then widen `PublicationVisibility` in `src/lib/collectionPublication.ts`, and the string
comparisons in `parsePublicationSnapshot` / `parsePublishRequest` that currently hard-code
`unlisted` and `public`. Discovery listings keep filtering to `visibility = 'public'` at the
query level, per the existing migration comment.

### Migration B — graph + switches

```sql
create table public.profile_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
```

Indexes on `(followee_id, created_at desc)` and `(follower_id, created_at desc)`. RLS mirrors
`collection_follows`.

`profiles` gains `likes_visibility public.visibility not null default 'public'` (with a check
excluding `'unlisted'`, meaningless for a list) plus the five `show_*` booleans, all
defaulting to `true` — those sections only ever contain content object-level visibility
already permits.

> **`follower_id` references `auth.users`, not `profiles`** — matching `collection_follows`,
> so an account can follow before onboarding. Any follower list must tolerate a follower with
> no profile row and **omit it from the count as well as the list**, or the count and the list
> disagree and it reads as a bug.

### Migration C — posts

`posts (id, author_id → profiles, item_local_id, title, url, source_name, author, excerpt,
commentary, visibility, created_at, updated_at)`, unique on `(author_id, item_local_id)`,
index on `(author_id, created_at desc)`.

**`visibility` defaults to `private`.** Coeus is private by default; a row that exists before
its author has chosen must not be public.

Writes go through `publish_post()` / `unpublish_post()` security-definer RPCs, revoked from
`public/anon/authenticated`, granted to `service_role` — exactly as `publish_collection` is,
including the owner guard that raises when the caller does not own the target.

The `followers` tier cannot be expressed in a simple RLS select policy without a subquery
against `profile_follows`. Since every read goes through the admin client and `canSee()`,
keep the RLS policy at the `unlisted`/`public` level as defense-in-depth and let `canSee` do
the real work — the same division of labour `getBySlug()` already documents.

### Pure lib

**`src/lib/visibility.ts`:**

```ts
export type Visibility = "private" | "followers" | "unlisted" | "public";
export type Viewer =
  | { kind: "anonymous" }
  | { kind: "signed-in"; id: string }
  | { kind: "follower";  id: string }
  | { kind: "owner";     id: string };
export function canSee(visibility: Visibility, viewer: Viewer): boolean;
export function isListable(visibility: Visibility, viewer: Viewer): boolean;
```

| | anonymous | signed-in | follower | owner |
|---|---|---|---|---|
| `private` | ✗ | ✗ | ✗ | ✓ |
| `followers` | ✗ | ✗ | ✓ | ✓ |
| `unlisted` | ✓ by link | ✓ by link | ✓ by link | ✓ |
| `public` | ✓ | ✓ | ✓ | ✓ |

`unlisted` is reachable by direct link for everyone, but excluded from profile listings and
Discover — that exclusion is `isListable`, so it is not re-derived at each call site. The
test states the sixteen cells **literally**, not by generation, so a change to one cell shows
in the diff.

**`src/lib/post.ts`** — `derivePostSnapshot()`. `commentary` comes from `options`, **never
from `item.note`**; `item.note` is the private annotation. The load-bearing test populates
every private field with a sentinel and asserts none appear in `JSON.stringify` of the
snapshot.

**`src/lib/archiveTypes.ts` / `archiveValidation.ts`** — `CollectionVisibility` gains
`followers`; `SocialAudience` becomes `Visibility`. Two lines move:
`archiveValidation.ts:52` (the collection allowlist) and `:66` (the audience check).

> **Tolerant read, migrate on write.** Existing snapshots carry `audience: "friends"`. The
> validator must **accept it and map it to `followers`**, never reject — a hard reject would
> brick an existing archive on load. The next save writes the normalised value, so the legacy
> value drains out naturally with no backfill. Risk R4.

### API & UI

- `/api/profiles/{follow,unfollow,followed}` — mirrors the three collection endpoints in
  structure, error shape and cache headers. **Keep the 401 body shape identical:**
  `FollowButton.tsx` already special-cases 401 to render a sign-in prompt. Self-follow returns
  422, not a 500 from the check constraint.
- `/api/posts/{publish,unpublish}` — the client sends only `itemLocalId`, `visibility` and
  `commentary`; the server derives the rest from its own archive data, exactly as
  `/api/collections/publish` does.
- `PATCH /api/account/profile/sections` — partial update. `src/lib/profileSections.ts` also
  exports `visibleSections(profile, viewer)`: for the owner every section is present and
  flagged where switched off; for everyone else a switched-off section is **absent entirely,
  count included**.
- `ProfileFollowButton` — takes initial following state as a **prop** rather than fetching the
  full followed list on mount the way `FollowButton` does. The page already resolves the
  follow relationship for the `followers` tier (risk R5), so this costs nothing and removes a
  round-trip and a flicker.
- `SectionSwitches` — optimistic toggle, per-toggle rollback, owner-only.
- Visibility control becomes **one shared component**, used by both selects in `ArchiveApp`
  (`:79` and `:394`) and again in Phase 3. Glyph encoding reads without colour — `●` private,
  `◐` followers, `◍` unlisted, `○` public — and each option carries an accessible name, not
  just a glyph.
- `/@handle/followers` and `/@handle/following` — nested routes, second rewrite rule
  `/@:handle/:section`. A switched-off list **404s for a visitor** rather than rendering
  empty; an empty list and a hidden list must not be distinguishable.
- `/discover` gains a **Following view** (a segmented control between Everyone and Following),
  not a ranking boost — a filter is legible and testable; a boost is neither at this content
  volume. The stale "Discover preview" note in `SocialApp.tsx` gets removed or scoped.

### Exit criteria

A person can be followed. A `followers` collection or post is visible to a follower and
invisible to a stranger, proven by pgTAP **and** by the `canSee` truth table. Switching off a
section removes both its tab and its count. No existing published collection changed
visibility.

---

## 7. Phase 3 — conversation layer

**Goal:** likes, reposts and replies. Three tables that all point at *other people's* objects,
which makes this phase's hard problem **indirect visibility**, not schema.

### Tables

```sql
create type public.target_type as enum ('collection', 'post');

likes   (actor_id → profiles, target_type, target_id, created_at)
          primary key (actor_id, target_type, target_id)
reposts (id, actor_id → profiles, target_type, target_id, created_at)
          unique (actor_id, target_type, target_id)
replies (id, author_id → profiles, target_type, target_id,
         parent_id → replies(id) on delete cascade,
         body, visibility, created_at, updated_at)
```

**`reposts` carries no note or body column.** That is the product decision, and leaving the
column out is what enforces it.

### The polymorphic trade

`(target_type, target_id)` cannot be a foreign key; Postgres will not enforce it.
**Recommended and deliberate:** keep the polymorphic shape, add a `target_exists` trigger on
insert, add an orphan sweep to the existing daily cron (`/api/archive/destinations/worker`,
see `vercel.json`), and write the trade-off into the migration comment the way the existing
migrations document their choices. A table per target type triples the surface for a system
with two target types today. Risk R6.

### `canSeeIndirect()` — the correctness centre

A repost references someone else's object. When that object's visibility is later lowered — a
public collection set to private — the repost row still exists and still points at it. If the
read path checks only the repost, the reposter's profile leaks the existence, title and link
of a collection its owner has since made private.

```ts
export function canSeeIndirect(
  row: { visibility: Visibility },
  target: { visibility: Visibility; ownerId: string } | null,
  viewer: Viewer,
  viewerFollowsTargetOwner: boolean
): boolean;
```

- `target === null` (deleted or orphaned) ⇒ **always false**. This is what makes the orphan
  sweep a hygiene task rather than a correctness dependency.
- Both the row *and* the target must pass.
- The viewer's relationship to the **target owner** is what matters for the target check —
  not their relationship to the reposter. These are different people, and conflating them is
  the specific bug this function exists to prevent. Following the reposter does **not** grant
  visibility of a `followers` target owned by someone else.

> A lazy implementation that read a denormalised title and url off the repost row would
> silently bypass this entire function. That is why `reposts` and `likes` store **no**
> denormalised copy of their target.

### Replies

Two-level rendering: a top-level reply with its target as context, then its direct responses
indented one level. Anything deeper flattens into that second level with a "replying to
@handle" prefix. Because `parent_id` exists, depth is a **rendering** decision and never a
migration — two bounded queries, no recursive CTE, no runaway indentation at 320px.

Reply visibility **defaults to the target's visibility**, not to public, so replying to a
`followers` post does not create a public row exposing that the post exists. A `parentId`
must reference a reply on the *same* target.

Every write validates the actor **can see** the target first — you cannot like, repost or
reply to something you were never allowed to see, and enforcing that at write time stops the
row existing at all rather than relying on read-time filtering to hide it.

### Likes

Governed as a whole list by `profiles.likes_visibility`. When likes are private the whole
sidebar block is **absent** for visitors — never a count with an empty strip, which would leak
the number.

### Exit criteria

All six tabs live. A test proves revoking a collection's visibility removes it from every
profile that reposted or liked it — the **indirect** case, not just the direct one.

---

## 8. Handle changes — parallel strand

Off the Phase 1 → 2 → 3 critical path; it can land any time after Phase 1. But **Phase 1 must
build for it** — that is the entire reason task 1.7 routes every handle lookup through
`resolveHandle()`.

```sql
create table public.handle_history (
  old_handle  text primary key check (old_handle ~ '^[a-z0-9_]{3,20}$'),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  released_at timestamptz not null default now()
);
```

The primary key on `old_handle` enforces the quarantine at the schema level: while the row
exists the handle is spoken for. A handle is available if unused in `profiles` **and** either
absent from `handle_history` or released more than 30 days ago. **The original owner may
reclaim immediately** — the quarantine protects against third-party impersonation, not against
someone changing their mind.

`resolveHandle` fills `redirectFrom` from `handle_history`; the page issues
`permanentRedirect()` (a 308). A retired handle always redirects straight to the current one,
never through an intermediate hop.

Claim-time checks in order: shape → not held (`HandleTakenError` → 409, unchanged) → not
quarantined (`HandleQuarantinedError` → 409 with a *distinct* message, because "taken" and
"recently released by someone else" are different situations for the user) → rate limit (N
per rolling year; check whether `src/lib/fixedWindowBudget.ts` fits before writing a new
limiter).

Releasing the old handle and updating `profiles` must be **atomic** — a crash between them
leaves a handle both free and unclaimable — so this needs a `change_handle` security-definer
RPC, not two client calls.

---

## 9. Test strategy

| Layer | Runner | Covers |
|---|---|---|
| Pure lib | `node --test` · `src/lib/*.test.mjs` | `publicProfile` boundary · `visibility` 16-cell table · `profileMedia` determinism · `derivePostSnapshot` field exclusion · link/location validators · the legacy `"friends"` mapping |
| Component | `node --import tsx` · `src/components/*.test.tsx` | `ProfileEditor` save + 422 per-field errors · `ProfileFollowButton` 401 path · `SectionSwitches` optimistic rollback |
| Database | `supabase test db` · `supabase/tests/*.sql` | RLS per new table · the `owner_id` backfill · the enum swap's policy and grant sets before/after · storage path restriction · self-follow rejection · the `target_exists` trigger |

**The rule that matters:** for every new public read path, one test asserting a specific
private field is *absent* from the output. `collectionPublication.test.mjs` already does this
for items; `publicProfile`, `post` and every Phase 3 derive get the same treatment. Testing
that the public fields are present catches nothing.

---

## 10. Risk register

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| **R1** | Medium | `/@:handle` may not parse in Next 16's path-to-regexp — a bare `@` before a parameter is unusual. | Spike it as the first task. Fallback is `NextResponse.rewrite()` in `proxy.ts`, which already runs on this path. |
| **R2** | **High** | The enum swap touches `publish_collection()`'s signature, its grants, and two RLS policies. A partial application leaves publishing broken for everyone. | One migration file, one transaction, nothing else bundled in. pgTAP asserting the policy and grant sets before and after. Rehearse against a local `supabase db reset` first. |
| **R3** | Medium | A public storage bucket with user-controlled paths is a general-purpose file host. | MIME allowlist + magic-byte check + size cap in the route, **and** a `<uid>/` path prefix in the `storage.objects` policy. Both layers, not either. |
| **R4** | Medium | Retiring `audience: "friends"` is a data migration *inside* a JSON blob that clients own and write. | Tolerant reader: accept `"friends"`, map to `"followers"` on read, rewrite on next save. Never a hard reject. |
| **R5** | Medium | `followers` visibility means every profile render must know whether this viewer follows this owner — an extra query per request. | Resolve once inside the `cache()` loader and pass it down as part of `Viewer`, so no component re-asks. |
| **R6** | Low | Polymorphic `(target_type, target_id)` has no referential integrity; deleted targets leave orphan likes and reposts. | Deliberate, documented trade. `target_exists` trigger on insert, orphan sweep on the existing daily cron, and `canSeeIndirect` drops orphans at read time regardless. |
| **R7** | Low | The `show_*` switches read like permissions but are display controls only. | Named and commented as display state in the migration; `canSee` lives in a different module. Recorded here so a future contributor does not mistake it for a boundary. |

---

## 11. Beads tree

Created 2026-09-06. Root epic **`bareaga_web-nfq`**. `→` marks a blocking dependency.

```
bareaga_web-nfq        [EPIC] Profile page at /@handle                                P1
│
├─ nfq.1               [Phase 1] Identity, route, published collections               P1
│   ├─ nfq.1.1         Spike: verify the /@:handle rewrite parses in Next 16          P1
│   ├─ nfq.1.2         Migration: profiles surface columns                            P1
│   ├─ nfq.1.3         Migration: collection_publications.owner_id + backfill         P1
│   ├─ nfq.1.4         Migration: profile-media bucket + owner path policy            P2
│   ├─ nfq.1.5         lib/publicProfile.ts boundary + tests      → 1.2, 1.3          P1
│   ├─ nfq.1.6         lib/profileMedia.ts generative cover + tests                   P2
│   ├─ nfq.1.7         profile validators + resolveHandle          → 1.2              P1
│   ├─ nfq.1.8         Route: u/[handle]/page.tsx + rewrite        → 1.1, 1.5, 1.7    P1
│   ├─ nfq.1.9         API: profile PUT fields + media upload      → 1.4, 1.7         P1
│   ├─ nfq.1.10        UI: Banner · Sidebar · Tabs + profile.css   → 1.8, 1.6         P1
│   ├─ nfq.1.11        UI: ProfileEditor client island            → 1.9, 1.10         P2
│   └─ nfq.1.12        AccountMenu → /@handle                      → 1.8              P2
│
├─ nfq.2               [Phase 2] Visibility, person graph, posts   → nfq.1            P1
│   ├─ nfq.2.1         Migration A: enum swap + publish_collection rebuild            P0
│   ├─ nfq.2.2         lib/visibility.ts canSee + truth table      → 2.1              P1
│   ├─ nfq.2.3         Migration B: profile_follows + show_* + likes_visibility        P1
│   ├─ nfq.2.4         Migration C: posts + publish_post RPCs      → 2.1              P1
│   ├─ nfq.2.5         lib/post.ts derivePostSnapshot + tests      → 2.4              P1
│   ├─ nfq.2.6         archiveTypes + tolerant "friends" reader    → 2.1              P1
│   ├─ nfq.2.7         API: /api/profiles/{follow,unfollow,followed} → 2.3            P1
│   ├─ nfq.2.8         API: /api/posts + sections PATCH            → 2.4, 2.3         P1
│   ├─ nfq.2.9         UI: ProfileFollowButton + SectionSwitches   → 2.7, 2.8         P2
│   ├─ nfq.2.10        UI: Posts tab + four-value chips            → 2.5, 2.2         P2
│   ├─ nfq.2.11        Routes: /@handle/followers + /following     → 2.3, 2.2         P2
│   └─ nfq.2.12        Discover "Following" view                   → 2.3, 2.2         P2
│
├─ nfq.3               [Phase 3] Conversation layer                → nfq.2            P2
│   ├─ nfq.3.1         Migration: likes · reposts · replies + trigger                 P2
│   ├─ nfq.3.2         canSeeIndirect() + revocation tests         → 3.1, 2.2         P1
│   ├─ nfq.3.3         API: like / repost / reply                  → 3.1              P2
│   ├─ nfq.3.4         UI: Likes + Reposts tabs + sidebar strip     → 3.2, 3.3        P2
│   ├─ nfq.3.5         UI: Replies tab + two-level threads         → 3.2, 3.3         P2
│   └─ nfq.3.6         Overview: revisit interleave with real data → 3.4, 3.5         P3
│
└─ nfq.4               [Parallel] Handle changes with redirects    → nfq.1            P2
    ├─ nfq.4.1         Migration: handle_history + quarantine                         P2
    ├─ nfq.4.2         resolveHandle redirectFrom; page 308s   → 4.1, 1.8, 1.7        P2
    └─ nfq.4.3         Allow handle edit + rate limit + squatting guard → 4.2         P2

bareaga_web-80m        [EPIC] Notifications (filed, not built)     → nfq.3            P3
```

**39 issues** — 33 tasks under 5 epics (a root, three phases, one parallel strand), plus the
filed notifications epic. 45 dependency edges, no cycles (`bd dep cycles` clean).

### Critical path

```
1.1 spike ──▶ 1.8 route ──▶ 2.1 enum swap ──▶ 2.2 visibility.ts
```

Everything else parallelises around those four. Five Phase 1 tasks are unblocked at the
outset: `1.1`, `1.2`, `1.3`, `1.4`, `1.6`.

### Filed, not built

`bareaga_web-80m` — notifications for a new follower, like, reply or repost. Phase 3 creates
the events and deliberately stops. Doing it properly needs its own table, a read/unread model,
a header surface, digest batching, and probably email — which this project has no sender for.
Plan it when Phase 3 closes and there is real event volume to design against; notification
design is mostly a batching and threshold problem, and both are unanswerable without data.
