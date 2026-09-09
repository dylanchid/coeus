---
page-width: 623
---
Coeus | coeuscoeus.com | RSS reader, archival tool, collections
August 20, 2026 | targeting Q4 2026

*Working document for talking through the product, its functionality, and building out
the idea. The formal spec is [`PRD.md`](PRD.md); the profile build plan is
[`profile-page-plan.md`](profile-page-plan.md). This file is for thinking out
loud, and it extends the original vault note 
_related_ : [[Coeus.canvas]]

---
## Name & identity
Candidates considered:

- **Bareaga** — *do not use for this.* Temporary; being kept for the builder mononym /
  clothing brand.
- **Aion** — Greek god of eternity. `aion.com` looks open, but already used by a video
  game, and "Ai" leading the name reads as AI-hype bait. Pass.
- **Ourea** — mountain gods. Available-feeling but thin.
- **Coeus** — Titan of intellect. **This is the name.** Reasons it works:
  - Vaguely near "coexist"; "co-" is a good leader.
  - Ambiguous pronunciation is fine — it reads as Greek/Latin, ancient, which the tech
    space likes right now.
  - But the product is *not* only pandering to the tech crowd. It should land just as
    easily with artistic / literary users. The name is neutral enough to carry both.
  - Domain: **`coeuscoeus.com`** obtained. Better than a novelty TLD, and the doubling
    scans like "cous cous" — memorable, a little warm, not corporate.

**The identity line:** *"A shared web." "A democratized web."* This goes on the Discover
page. It's the thesis — see [Collections](#discover--collections-the-transformative-part).

---
## The through-line
Coeus is a **personalized front page for the open web**. You pick the sources. The
software does the mechanical work — fetching, normalizing, deduplicating, remembering what
you asked for — and every "smart" feature is a transparent tool you operate, not a black
box that operates you.

Two things make Coeus more than another RSS reader: **collections** (the democratized-web
layer) and **customization** (it is genuinely *your* homepage, down to the type and the
ranking rules). The profile page is what ties a person's collections, sources, and
identity into one address.

---

## Where the product actually is

**Real and usable solo today, no account:** all four Reader views, the transparent ranking
engine, source discovery with custom feeds, the archive with notes/tags/collections,
Markdown/CSV export, full preference portability, five palettes × four fonts × light/dark.

**Built at the data layer, not yet public:** collection publication — a collection can be
published to a stable URL (`/c/<slug>`) with a curator note, attribution intact, and its
own RSS feed; visibility is owner-controlled; signed-in users can follow it. Schema, RLS,
and RPCs are validated against a live Supabase stack.

**Built and shipping:** live sync adapters for **Obsidian, GitHub, and Notion**
(destinations that push your archive out to tools you already use).

**The next major build:** the profile page at `/@handle`, phased —
(1) identity + route + published collections;
(2) the visibility model + a person-follow graph + posts;
(3) the conversation layer (likes, reposts, replies) with correct *indirect* visibility.

The discipline through all of it: **private by default.** Every new default is the more
private one; every public read path gets a pure `derive` function whose test asserts a
private field is *absent*, not that the public fields are present.

---

## Product

### Read

The Reader brings articles from your feeds into one finite page. Switch between a
source-by-source grid, balanced coverage, strict recency, or ranking based only on rules
you set. No infinite scroll — reading sessions have a bottom.

### Sources

The place to find publications for your Reader. Browse the directory by topic, region,
language, type, and cadence, or paste any RSS, Atom, blog, or Substack URL. Private
1–5 star ratings for your own sorting, kept separate from the editorial directory rank.

### Discover → Collections (the transformative part)

> *Original note:* Collections — this can be the transformative aspect of the website and
> the internet. Personal and community collections. For popular ideas, personal websites,
> quality blogs, let people post and share links to collections (obviously needs
> moderation of some sort). This emphasizes the ideal of a shared / democratized web.
>
> Community collections, links, snippets. Share your own; like, comment, repost, share
> others'.

**The claim, stated plainly.** A collection is an ordered set of links, each carrying its
original source and an optional human note, published to a stable URL and emitting RSS.
That's a small object. The claim is that it's the right unit for rebuilding the parts of
the web that got hollowed out.

For fifteen years, finding a good page has meant a platform's algorithm deciding to show
it to you, optimized for *its* engagement. The things that used to do discovery —
blogrolls, webrings, del.icio.us, StumbleUpon, human-edited directories, "links" posts on
personal blogs — died or were absorbed. What replaced them ranks for retention and can't
be pointed at, subscribed to, or taken with you.

A collection is the old thing rebuilt with current tools:

- **It has a URL.** A page, not a feed item that scrolls away.
- **It has a feed.** Subscribe to a collection like a blog; new links the curator adds
  arrive in your reader. No account required to follow along.
- **It's ordered by a person.** The curator's sequence *is* the editorial judgment. No
  ranking model in between.
- **It keeps attribution.** The excerpt is never detached from its canonical link — a hard
  rule, enforced at the publish boundary. A collection structurally cannot launder a link
  away from its origin, so it can't become a content farm.
- **It's portable.** Markdown or CSV export any time. If Coeus disappears, your collections
  are a folder of files and a list of URLs. The web loses nothing.

**Personal vs. community collections.**

- *Personal* — your archive, organized. "Papers to reread," "stuff for the essay," "things
  for my sister." Works locally today. Some you publish; most you don't.
- *Community* — the transformative, harder end: a collection several people maintain around
  a topic, an idea, an event, a field. Examples:
  - "Best writing on housing policy, 2020–present," kept by a few people who read it.
  - "Primary sources on [event]," assembled in real time by people near it.
  - "The good personal websites" — the living human directory that used to exist.
  - "Introductions to [field], ranked by a working [field] person."

  The data model already carries `kind: personal | community` and
  `visibility: private | unlisted | public`. What community collections still need is a
  **contribution/permission model** — who can add, reorder, remove, and how a submission
  becomes canonical — plus a moderation model (below).

**The community interactions** (like, comment, repost, share) sit on top of collections,
links, and snippets. Design rules being held:
- Reposts are **plain** — "repost with a note" is a *reply* (threaded), not a quote-post;
  the schema has no body column on reposts.
- Reply threads are **two levels deep, then flatten** — no runaway indentation, no
  comment-section culture by construction.
- No global engagement ranking on Discover. The cleanest version is a **"Following"
  filter** — you see what the people and collections you follow put out, in order, with a
  bottom.

**Why it matters beyond the product.** If collections work, the outcome isn't "Coeus has a
nice feature" — it's that a layer of human-curated, subscribable, portable link collections
exists again, owned by nobody, because the collections are just RSS and exportable files.
A personal site links its author's collection instead of a stale links page; a blog
publishes its "further reading" as a feed; a field maintains a canonical reading list that
updates. And because everything emits RSS, collections **compose** — follow ten and get
one merged, finite, unranked page, which is exactly the Coeus Reader. The curation layer
and the reading layer are the same shape.

**Moderation — the unavoidable problem.** A public surface where people submit links is a
spam / SEO / abuse magnet. This is the part that can sink the ambition, so it needs a real
answer:

1. **Curation is the moderation.** Community collections have named maintainers who
   approve contributions — open the way a Wikipedia article is open, with visible history
   and accountable editors, not open the way an unmoderated forum is. Default, and
   probably right for a long time.
2. **Trust graph.** Discover is seeded by the people *you* follow and the collections
   *they* contribute to. Spam has to get past someone you chose to trust, not a global
   ranking.
3. **Curator/collection-level muting and removal** — cheap, because there's no algorithmic
   amplification to fight.
4. **Report + small editorial review** for the fully public listing (`/c`), kept
   hand-curated as long as possible.

Near-term honest position: **public *listing* stays editorial and small; public
*collections* are reachable by URL and RSS but discovered mostly through people.** The
fully open community directory is a later question, contingent on a moderation model that
works at the volume it would attract.

### Archive

Keeps saved reading with its source, notes, tags, state, and collections. Your library
lives locally today and stays portable instead of being locked inside Coeus — whole-archive
or per-collection export to Markdown (Obsidian-shaped YAML frontmatter) or CSV.

### About

Helps users understand the four surfaces and the four principles (sources over algorithms,
finite pages over feeds, useful controls over chrome, open formats over lock-in).

### Profile

*Original note left this blank. Building it out here.*

**What it is.** One route, `/@handle`, serving two readers from the same layout (the
SoundCloud reference: full-bleed cover with the name over it, square avatar overlapping
lower-left, tab + actions bar, feed column left, persistent sidebar right).

- *To a visitor* — a curated directory: who this person is, a short list of where else they
  are on the web (links, not a link farm), and the collections they've published. A way to
  follow them. Later: posts, reposts, replies, likes — each tab hidden entirely if there's
  nothing the visitor is allowed to see.
- *To the owner* — the same page, with `Edit` instead of `Follow`, inline visibility
  controls, unpublished collections shown greyed, and a jump-off into every collection.
  No separate `/me`; an `isOwner` check flips the affordances in place.

Cover is a **generative default seeded from the handle** (an IBM Plex Mono field) or an
uploaded photo.

**Why a *reader* would want one — the gap.** There is no good home for a reading identity.
To show someone "here's what I pay attention to and what I've found worth keeping," today
you'd have to assemble:

| Option | Why it isn't it |
|---|---|
| Blogroll on a personal site | Almost nobody has one anymore |
| OPML export | Portable, but nobody opens OPML for fun |
| Are.na profile | Closest thing — but it's visual research, blocks aren't feeds |
| Substack recommendations | Locked to Substack, only lists other Substacks |
| A pile of link-tweets | Buried in a timeline, un-findable in a week |
| Linktree | Flat list of URLs, no context, no content behind them |

None of these is *the reading you actually do plus the things you actually saved, on one
page, at one stable URL, that you own and can leave with.* That's the Coeus profile.

Concrete uses:
- **The bio link.** `coeuscoeus.com/@you` in your Mastodon / Bluesky / email signature.
  One click → your information diet, and a subscribe button on your best collection.
- **The reading rec, made once.** Instead of DMing five people five links, make a
  collection; it has a URL and a feed, and new additions reach followers automatically.
- **Following a person, not an algorithm.** Follow a few people whose taste you trust;
  their new public collections and posts show up in Discover's Following *filter* (not a
  ranking boost). You see everything, in order, with a bottom.
- **A durable record.** Two years out the profile still resolves, collections still export,
  and a handle change keeps every old link alive via a redirect table.

**What makes it usable — and what to resist.** A profile is a *social* object on a product
whose pitch is *not being* a social feed. Resolutions:

- **Sections are a display preference, not a permission.** The `show_*` switches tidy a
  profile; they protect nothing. `canSee()` in a separate module does enforcement. Naming
  that distinction loudly is deliberate.
- **Follower counts can be turned off entirely** — number and list — with the owner still
  seeing their own, marked hidden. No dopamine loop by default.
- **Every tab with nothing visible to *this* viewer is absent, not empty.** An empty list
  and a hidden list must be indistinguishable, or hiding leaks.
- The bet: a profile can carry identity and following *without* the metrics race, the
  infinite reply tree, the quote-dunk, or the ranked feed. Strip those and what's left is
  closer to a personal website than to Twitter — which is the point.

---

## Connections (sync)

> *Original note:* Needs to sync with people's existing archives on other sources —
> Obsidian, Notion, Are.na.

**Shipping today:** live push adapters for **Obsidian**, **GitHub**, and **Notion** —
your Coeus archive is written out into those tools in their native shapes, on a cadence,
via a background worker.

**Still open:**
- **Are.na** — read *and* write. Are.na is the closest neighbor in spirit (paid, no ads,
  no algorithm, curation-first); two-way sync with Are.na channels ↔ Coeus collections is
  a natural bridge and a distribution channel.
- **Direction.** Today's adapters are Coeus → tool. Pulling *in* (an existing Obsidian
  vault of clippings, a Notion reading database, an Are.na channel) as the on-ramp for a
  new user is higher-value and harder — it's the "import your existing reading life"
  moment.
- **OPML** in/out for the source list itself — table stakes for an RSS product, cheap,
  and a trust signal ("you can leave").

---

## Customization

> *Original note:* A key facet. Being your personalized homepage for the internet —
> control over fonts, spacing, color theme. That's the visual base level. High control
> over how content is organized, displayed, how articles are ranked — all important to the
> cause. **Key: maintaining freedom of customization while keeping a consistent theme and
> structure is tantamount.**

This is a genuine pillar, not a settings page. It's the difference between "a reader" and
"*your* homepage."

**What exists:** theme (system/light/dark) × 5 palettes (ink, paper, terminal, copper,
rose) × 4 fonts (mono, sans, serif, slab); reading density; which fields show
(summaries, authors, ages, engagement counts); four Reader layouts; drag-to-reorder source
columns; the keyword-rule ranking editor; feed window (result count + lookback);
full preferences export/import as portable JSON.

**Where it goes:**
- **Spacing / measure / line-height** controls to match the font work (the vault note asks
  for this explicitly).
- **Layout-level** customization — column counts per breakpoint, card vs. list, what the
  sidebar holds.
- **Ranking** stays the flagship: user-authored keyword rules and per-source weights that
  *show their work* on every card. This is the "transparent tool, not black box"
  principle made concrete, and it should get easier to author (rule templates, a tester).
- **The profile** inherits the same tokens — a profile that ignores `data-theme` /
  `data-palette` is a bug.

**The tension to hold** (straight from the note): freedom of customization *vs.* a
coherent product. The resolution is a **token system** — users choose values within a
designed space (palettes, type scales, spacing ramps), never raw CSS. Every option is
constrained to still look like Coeus. The consistent structure is the frame; customization
is what you hang in it.

---

## Market viability

**Comparables and what Coeus takes from each:**

| Product | What it proves | Coeus difference |
|---|---|---|
| **Are.na** | People pay $7–$20/mo for an ad-free, algorithm-free personal curation space | Feeds, not blocks; RSS in and out; reading-first |
| **Letterboxd** | A single-vertical "what I consume + what I think" profile can become a beloved, monetizable network | Vertical is "the open web"; collections instead of film lists |
| **Substack recommendations** | Recommendation graphs drive real subscription growth between creators | Not locked to one publishing platform; a collection points anywhere |
| **Pinterest** | Board-based link collecting is mass-market, not niche | No engagement ranking, no shopping surface, links keep source + context |
| **del.icio.us / Pinboard** | Social bookmarking had a devoted audience; Pinboard ran profitably solo for a decade | Collections are readable *pages* with curator notes and feeds, not tag dumps |
| **Feedly / Inoreader / NetNewsWire** | Durable paid market for "own your reading" | Adds a portable public identity on top; keeps the no-account floor |

**The wedge:** none of the RSS readers have an identity/social layer worth using, and none
of the curation networks are feed-native. Coeus sits in the empty quadrant — *a
feed-native reading tool with a real, portable public identity.*

**Who pays, eventually** (Are.na / Pinboard / Letterboxd-Pro model): a free tier that's
genuinely complete for solo use (already true), plus a paid tier for people who want their
profile to be a *presence* — custom domain on the profile, unlimited published
collections, private collaborative collections, richer analytics on their own feeds,
hosted email digests of followed collections. Nothing paywalls the core promise.

**Audience beyond tech.** The name and the customization pillar are both bets that this
reaches artistic / literary / academic readers, not just the HN crowd. Those users are
underserved by existing RSS tools (which look like dashboards) and are exactly the people
who maintain Are.na channels and Letterboxd profiles. Design and type quality is
market strategy here, not polish.

**Cold-start.** A profile network is worthless with no profiles. Three structural
mitigations, then the outreach plan below:
- The profile is useful with an audience of zero — a better blogroll and bio link on day
  one, like a Letterboxd profile you keep even with no followers.
- Collections emit RSS, so a published collection is useful to followers who never make a
  Coeus account — it meets people in the reader they already have.
- Every seeded curator arrives with an existing audience elsewhere; the collection's RSS
  feed and the `coeuscoeus.com/@handle` bio link do the distribution, not a Coeus feed.

---

## Seeding & community rollout

The Discover layer has no value until there is curated inventory in it, and the fastest
way to get quality inventory is to hand-recruit the people whose reading other people
already want to see. This is a **concierge launch**, not a growth-hack: personalized
outreach, white-glove onboarding, one segment at a time.

### The shape of it

**~25 people per segment**, contacted individually (never a blast), across a spread of
creative and web-native-curator communities — deliberately *not* just the tech crowd. Aim
the list at people who already do public curation and have somewhere to point back from:

- **5k+ followers on Twitter/X or Bluesky**, or
- an **active blog / personal site** (bonus if it has a blogroll or a "links" section), or
- a **newsletter** with real readership, or
- a **well-tended Are.na**, a **Letterboxd** people follow for the reviews, a public
  Zotero library, etc.

Audience/reach is a proxy for "their taste travels," not the point in itself — a librarian
with 1,200 engaged followers is a better seed than a growth account with 50k.

### Segments (start with 5, expand to 9)

| # | Segment | Why they fit | What their seed collection looks like |
|---|---|---|---|
| 1 | **Newsletter writers** — essayists, "link" curators (Substack, Ghost, buttondown, TinyLetter refugees) | Already curate weekly; a collection *is* their links section with a feed | "Everything I linked in [newsletter], 2026" |
| 2 | **Link-bloggers / IndieWeb / personal-site people** — Kagi Small Web, blogroll culture, webmention crowd | This is the exact web they miss; they'll evangelize the democratized-web framing | "The blogs I actually read" |
| 3 | **Visual & design creatives** — designers, illustrators, type designers, Are.na power users | Are.na proves they'll maintain a curation space; Coeus adds feeds + a public profile | "References for [project/theme]" |
| 4 | **Writers & literary figures** — novelists, poets, critics, lit-mag editors, "Poetry Twitter" | Underserved by dashboard-y RSS tools; the name and typography bet is aimed here | "Contemporary poetry worth your time" |
| 5 | **Academics & independent researchers** — people who post syllabi, reading lists, "what I'm reading" threads | Reading lists are their native output; a followable, updating list is a real upgrade | "A working bibliography on [topic]" |
| 6 | **Librarians, archivists, information-science people** | The curation-as-a-craft ethos is theirs already; natural early advocates and moderators | "Primary sources on [event/subject]" |
| 7 | **Journalists** — beat reporters, investigative, explainer writers | Curate primary sources constantly; a public collection is a credibility artifact | "What I'm reading on the [beat]" |
| 8 | **Musicians & music writers** — crate-diggers, critics, radio/DJ people | Crate-digging culture maps cleanly onto ordered collections | "Liner-notes reading / the scene right now" |
| 9 | **Tech builders with taste** — selectively; indie hackers, local-first / open-web people | Will get the product instantly and file good feedback — but don't let them dominate the first impression | "Local-first & the open web" |

### The ask (kept small)

1. **Claim your handle** — `@yourname` is reserved for you.
2. **Seed one collection.** We'll do it *with* you on a call — import an existing Are.na
   channel, a newsletter archive, a Zotero library, or just talk through 15 links.
3. **That's it.** No posting quota, no obligation to be "active." If new links get added
   over time, followers get them; if not, the collection still stands as a page.

Offer to migrate an existing artifact (Are.na channel, blogroll OPML, "best of"
newsletter issue) so the first collection costs them near-zero effort.

### Sequencing

- **Gate:** don't start until `/@handle` + published collections + follow actually work
  end-to-end for a stranger (profile-page-plan Phases 1–2). A concierge launch against a
  broken profile burns the exact people you can't re-approach.
- **One segment every 1–2 weeks**, ~25 contacts each, so onboarding calls stay real. 5
  segments ≈ 6–10 weeks to a first cohort of ~125 invited, ~40–60 with a live collection.
- Ask each onboarded curator for **2–3 names** in their world — warm intros convert far
  better than cold, and they define the next segment's list.
- Only open the **public `/c` listing** once there's enough inventory that it doesn't look
  empty *and* a moderation process exists (see Discover → moderation).

### What "working" looks like (rough targets per 25)

| Milestone | Target |
|---|---|
| Reply to outreach | ~12 |
| Claim a handle | ~9 |
| Publish ≥1 collection | ~5 |
| Still adding to it after 60 days | ~2–3 |
| Refer someone | ~3 |

If publish-rate is under ~15%, the onboarding friction is too high (fix the concierge
flow / import tools) before contacting the next segment.

### Cautions

- **Personalized or nothing.** Reference their actual work in the first message. A
  templated DM to this audience is worse than no message — these are people who notice.
- **Don't scale past your onboarding capacity.** 25/segment exists so each person can get a
  real call. Doubling the list halves the conversion and burns names.
- **Protect the first impression.** The tech-builder segment is last-ish on purpose; the
  early Discover surface should read as *creative and literary*, not as another
  indie-hacker tool.
- **Track it plainly** — a single sheet: name, segment, source of lead, contacted, replied,
  handle, collection URL, last activity, referred-by. This *is* the CRM for now.

---

## Real risks
- **Moderation** of a public collection surface (see Discover section) — hardest unsolved
  part, gates how public "community" can safely get.
- **"Why not just post links on Bluesky?"** The answer must stay crisp: a timeline
  forgets, a collection remembers; a feed ranks, a collection is ordered; a post is locked
  in one network, a collection has a URL, a feed, and an export. If that answer gets
  muddy, the product is in trouble.
- **Scope creep toward being a social network.** Every phase adds a social primitive. The
  discipline (plain reposts, shallow replies, optional metrics, display-only sections) is
  load-bearing. The moment the profile optimizes for time-on-site, the product has
  betrayed its pitch.

---

## Open questions worth chewing on

- **Does the profile need posts at all, or are collections enough?** A one-item collection
  is almost the same as a post + commentary. Maybe posts are a UI affordance over
  collections rather than a separate type.
- **Following a person vs. following their collections** — the plan does both. One concept
  too many? A person is roughly "all their public collections + posts."
- **How editorial should Discover be?** The cleanest version is *no* global ranking, ever —
  you see what the people and collections you follow put out, full stop. Smaller, slower,
  probably better.
- **Import as the on-ramp.** The highest-value Connections work is pulling an existing
  Obsidian / Notion / Are.na reading life *in*, not pushing out. That's the "give me your
  existing archive and I'll make it a homepage" moment.
- **Collections as the reading layer, made explicit.** If following collections produces a
  merged finite reader, should "a Coeus account" just *be* "the collections and sources
  you follow," with local no-account mode as the entry ramp?
- **The customization ceiling.** How far can users go before the product stops looking like
  one product? Where exactly is the line between "a palette" and "raw CSS," and who polices
  it?
- **Who runs the seeding outreach?** 225 personalized contacts + onboarding calls is a
  real job for months. Is that the founder's time (best for conversion, worst for
  bandwidth), a part-time community hire, or paced slowly enough that one person absorbs
  it?

---

*See also: `Coeus.canvas` (visual inspiration board — homescreen, login flow, collection
gallery, profile references, theme studies), [[RSS_work_sep5]] (OAuth redirect-URI notes).*
