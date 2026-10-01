# Information architecture

**Status:** proposed UX organization, reconciled against the current route inventory on 2026-09-28.

## Product map

```text
Coeus
├── Read /                         Daily reading
│   ├── Grid · Top · Focus · Ranked
│   ├── Search, topic filter, command palette, settings
│   ├── Story actions: preview/open · save · share
│   └── Source failure and empty states
├── Sources /sources               Build the reading stack
│   ├── Browse subjects
│   ├── Search, sort, advanced filters
│   ├── Source details and add/remove
│   └── Add a custom RSS/Atom source
├── Archive /archive               Keep and return to reading
│   ├── All saved items / collections
│   ├── Search, state, star, notes, tags
│   ├── Export, sync/recovery, destinations
│   └── Publish a collection
├── Discover /discover             Human-curated public web
│   ├── Everyone / Following
│   ├── Public collections and sourced clips
│   └── Share a sourced clip
├── People and collections         Public, addressable objects
│   ├── /u/[handle], followers, following, reply thread
│   └── /c, /c/[slug], collection RSS
├── Account                         Optional identity and sync
│   ├── /signin → /auth/callback → /welcome
│   └── Account menu, profile editing, sign-out/delete
└── About /about                   Product model and principles
```

## Primary navigation contract

The five global destinations are **Read, Sources, Discover, Archive, About**. They answer distinct reader jobs and should stay at this level; settings, commands, profile, publishing, export, and account are contextual utilities rather than peer product areas.

| Destination | Reader job | Arrival promise | Key exit paths |
| --- | --- | --- | --- |
| Read | “What should I read now?” | One finite, source-controlled reading session | Save/share a story; tune sources or settings |
| Sources | “What belongs in my reading stack?” | A directory where discovery and subscription are clear | Add to Reader; create a custom source |
| Discover | “What have people I trust found?” | Attributed, human-curated links and collections | Follow; open source; save/share |
| Archive | “What did I decide to keep?” | A private, searchable library with portable exits | Re-read; annotate; organize; export/publish |
| About | “Why does Coeus work this way?” | The product principles and honest capability boundary | Begin reading or source discovery |

## Object and action model

Use the same nouns everywhere. A **source** produces **articles**; an article may become an archived **item**; items can belong to a **collection**; a sourced item may become a public **post**. An account enriches persistence and publication but never gates ordinary reading, source selection, or local archiving.

| Object | Primary home | Supporting homes | Actions that must stay consistent |
| --- | --- | --- | --- |
| Source | Sources | Read, Settings | Add/remove, hide, order, preference/rating |
| Article | Read | Preview, Share sheet | Open original, preview when permitted, save, share |
| Archive item | Archive | Share sheet, Discover | Read state, star, note, tags, collection membership, export |
| Collection | Archive | Discover, `/c/[slug]`, profile | Organize, visibility, publish/unpublish, follow, RSS |
| Profile | `/u/[handle]` | Discover, account | Follow/unfollow; owner edit |

## Progressive-disclosure rules

1. Keep one primary action visible per repeatable row/card. Source rows expose **Add** or **Added**; details reveal rating and secondary actions.
2. Keep the user’s active context visible. Search/filter chips and result count stay above results; browsing taxonomy recedes once it no longer helps.
3. Put creation apart from finding. “Add a custom source” is its own outlined trigger/panel, never an implied part of directory filtering.
4. A setting belongs at the closest stable scope: story action on a story, source preference in source details, reading-wide defaults in Settings.
5. Do not hide product truth. Local versus synced status, private versus public visibility, ranking reasons, and preview limitations must remain explicit.

## Responsive behavior

| Range | Navigation and layout behavior |
| --- | --- |
| Wide desktop | Persistent primary navigation; source filters can occupy a compact left rail; multi-column Reader remains available. |
| Narrow desktop/tablet | Subject browser collapses after use; advanced filters move to a popover/drawer; row actions become an overflow menu. |
| Mobile | Primary nav remains reachable without horizontal overflow; filters use a modal/drawer; no hover-only action or information; preserve keyboard and screen-reader access. |

## Naming decisions

- Use **Browse subjects** for the expandable category matrix; it describes its job and does not overpromise a global taxonomy.
- Use **Filters** only for constraints on the current result set; show an active count and a clear-all action.
- Use **Add a custom source** for the pasted-feed flow; “Suggest a source” would imply editorial review, which is a different feature.
- Use **Added** as a state, with a visible remove path in details/overflow; avoid making the reader guess whether a black button will add or remove.
