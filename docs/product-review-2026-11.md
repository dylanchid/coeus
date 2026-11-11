# Coeus product review — 2026-11-10

**Status:** Review and recommendation, not yet accepted. Once decisions are made,
fold them into [`PRD.md`](PRD.md) and the "Current status" section of
[`HANDOFF.md`](../HANDOFF.md) (last updated 2026-09-09).
**Inputs:** PRD, product-notes, HANDOFF, destination-delivery-decision, the route and
`src/lib` inventory, the open beads, the last ~30 merged PRs, a signed-out walk of
coeuscoeus.com, and aggregate row counts from the Supabase project configured in
`.mcp.json`.

---

## 1. The one-paragraph verdict

The reader is real and good. Around it, Coeus has built three products at once: a
reader, a social curation network, and an archive-to-tools sync service. It has
**one account** (created 2026-09-08, last sign-in 2026-11-04), **zero published
collections, zero posts and zero follows**. The concierge launch in
`product-notes.md` was gated on "`/@handle` + published collections + follow
working end-to-end for a stranger". That gate was technically met on 2026-09-07.
In the two months since, roughly 25 PRs went to refactors, queue/OIDC hardening and
latency work for a delivery feature with one user, and none went to getting the
first outside curator in. The main constraint is not engineering throughput. Nobody
outside the team has used the product, so there is no feedback loop.

## 2. What exists, weighted

| Area | Non-test `src/lib` lines | Live usage | In PRD? |
|---|---:|---|---|
| Feeds / Reader / Sources | ~2,850 (+970 articles/preview) | Works for anonymous visitors (21/22 sources loaded on this walk) | Yes, as the core |
| Archive + sync | ~2,000 | 1 archive | Yes |
| Social: profiles, posts, replies/likes/reposts, notifications | ~5,640 (`profiles` + `conversations` + `publications` + `notifications`) | 1 profile, all other tables at 0 | Partly (Discover); likes/reposts/replies are only in product-notes |
| Destinations (Notion, Obsidian via GitHub) + Vercel Queue | ~1,790, plus a staging project and the OIDC investigation | 1 destination, 4 deliveries | **Not in the PRD at all** |
| Placeholders | `/messages` ("coming soon"), `/plus` ("coming soon"), bell + envelope icons shown to signed-out visitors | — | No |

The largest area of the codebase (social) has the least usage, and the most recent
engineering work (destinations) sits outside the written product intent.
`product-notes.md` itself says import is "higher-value" than push-out sync.

## 3. Where the pieces don't fit together (observed on the live site)

1. **Discover shows fake people as real activity.** A signed-out first visit to
   `/discover` shows posts by "Mira Chen", "Common Index" and "You · 98d · Public",
   a post the visitor never made, plus a community collection with "3 curators". At
   the same time `/c` says *"No public collections yet."* Two views of the same
   concept contradict each other. Coeus's pitch is honest, human, attributed
   curation, so demo posts dressed as real social proof undercut that pitch directly.
2. **The archive is pre-filled.** A new visitor sees "Archive 4" in the nav and four
   seeded items with notes. Their first save gets mixed in with fixtures they didn't
   create.
3. **The Reader leads with a failure.** The first line under the toolbar is
   "21 of 22 sources loaded · 1 failed · Which sources failed?". Failure isolation
   is a real strength, but announcing it is the wrong first sentence.
4. **The core loop never closes.** The intended flywheel is *Sources → Reader → Save
   → Collection → someone follows it → it appears in **their** Reader*. The last step
   doesn't exist. Followed content only shows up in Discover's "Following" tab
   (`src/lib/feeds/followedFeed.server.ts`), a separate social feed, not as a source
   in the finite Reader. Collections emit RSS, but Coeus doesn't consume its own
   collections as sources. That missing step is what keeps "reader" and "network"
   two separate products instead of one.
5. **Duplicate concepts.** `product-notes.md` already asks the right questions:
   - Post vs. one-item collection: "a one-item collection is almost the same as a
     post + commentary."
   - Following a person vs. following their collections: "one concept too many?"
   - ShareSheet offers five siblings, including *community collection*, which has no
     contribution or moderation model.

   Each duplicate doubles the schema, visibility rules (`canSeeIndirect`) and tests.
6. **RSS basics are missing.** There is no OPML import/export anywhere in `src/`.
   The notes call it "table stakes… cheap, and a trust signal". It is also the
   cheapest version of the "import your existing reading life" on-ramp.
7. **Placeholder chrome.** Notifications and Messages icons appear for signed-out
   visitors, Messages is a stub, and "Try+" in the footer leads to "coming soon".
   Each one hints at a bigger product than the one that works.

## 4. The core, stated once

> **Coeus turns the sources you choose into one finite page, and turns what you keep
> into collections other people can follow — in Coeus or in any RSS reader.**

Every surface should earn its place by feeding that sentence:

- **Sources** pick inputs.
- **Reader** consumes them.
- **Archive** keeps them.
- **Collections** publish them with attribution and RSS.
- **Profile** is the address that lists a person's collections.
- **Follow** means "this collection becomes a source in my Reader".

## 5. Keep / fold / freeze

| Decision | Surface | Why |
|---|---|---|
| **Keep and sharpen** | Reader (4 views, transparent ranking), Sources (+ custom feeds), Archive (+ export), published collections with RSS, `/@handle` profile as a page of collections | These are the sentence above. |
| **Fold** | Posts → a collection entry with a note (or a one-item "clips" collection per person) | Removes a parallel content type and its visibility rules; the "sourced clip" rule still holds. |
| **Fold** | Person follow → "follow everything @x publishes" = follow their collections | One follow concept, one feed path into the Reader. |
| **Freeze** (keep the code, hide from nav, no new work) | Likes, reposts, replies, notifications inbox, `/messages`, `/plus`, community collections | No users means no interactions to manage. Revisit when ~50 curators exist and ask for them. Notes: "the moment the profile optimizes for time-on-site, the product has betrayed its pitch." |
| **Freeze** | Destinations production queue gate (`bareaga_web-9hz.8`); keep `after()` + daily cron + Sync now | Already works for the one user. The Queue proof is done and documented, so pick it up when destinations have users. |
| **Remove** | Fixture posts/curators in Discover, seeded archive items for new visitors | Replace with empty states that teach the next action (save → organize → publish). |

## 6. Priorities (next ~4–6 weeks)

1. **Honest first run.** Remove fake Discover activity and archive seeds, write
   instructive empty states, demote the "N failed" line to a quiet indicator, and
   hide placeholder icons when signed out.
2. **Close the loop.** Following a collection adds it as a source in the follower's
   Reader (a column, Ranked-eligible), and anonymous users can add any `/c/[slug]`
   feed. This is the single change that makes the network and the reader one product.
3. **OPML import/export** for sources. It's cheap, it's the "you can leave" trust
   signal, and it's the first import on-ramp.
4. **Publish flow for a stranger, end to end.** Sign in → claim handle → turn an
   archive collection into a published collection → share `/@handle`. Walk it with
   Playwright and by hand on mobile.
5. **Start the concierge launch small.** 10 people from your own network before
   segment 1. Track them in the single sheet `product-notes.md` describes. Success
   metric: % who publish ≥1 collection within a week.
6. **Write down the freeze.** Update the PRD and HANDOFF so future agent sessions
   stop extending frozen surfaces.
7. **Housekeeping.** Enable RLS on `notion_oauth_states` and
   `storage_growth_snapshots`. Grants to `anon`/`authenticated` are already
   revoked, so they aren't exposed today, but the Supabase advisor flags them as
   critical and RLS is defense in depth.

## 7. What this means for the agent-orchestration idea

Revisit it after item 5 starts producing feedback. At that point the backlog will be
real user problems, narrowly specified as beads, and the bottleneck question ("I
have N well-specified beads and can only drive 2 at a time") has a measurable answer.
Before then, more agent throughput mostly extends frozen surfaces faster.
