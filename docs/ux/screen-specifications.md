# Screen specifications

**Status:** functional inventory and UX acceptance contract. “Live” describes current behavior; “Proposed” records the intended next design pass.

## Global shell

| Area | Live behavior | Required behavior / acceptance |
| --- | --- | --- |
| Header | Wordmark, primary navigation, slash command button, account menu; settings panel from global chrome | Every icon-only control has an accessible name and a tooltip. Keyboard focus is visible, unobscured, and follows the visual order. |
| Primary navigation | Read, Sources, Discover, Archive, About; active route and archive count | Active page is exposed with `aria-current`; labels remain understandable without styling. |
| Status | Persistence errors and save state surface below the header | State is polite/live where appropriate, actionable when recoverable, and never the only indication of a failed save. |
| Settings / commands | Keyboard-triggered settings and command palette | Dialog focus is managed; closing restores focus to its trigger; shortcuts do not fire while a form control is being used except the documented command shortcut. |

## Read — `/`

**Job:** assemble one bounded reading session from sources the reader chose.

| Zone | Content and behavior | States / acceptance |
| --- | --- | --- |
| Session controls | Search, topic filter, view mode, refresh, display/settings commands | Query reports shown stories and sources. Clearing search restores the current view, not a different session. |
| Grid | Source columns, reorderable in Grid mode | Reorder persists; alternate keyboard-accessible ordering path is available because dragging cannot be the only method. |
| Top / Focus / Ranked | Balanced, chronological, and transparent ranking presentations | Ranked cards show their reasons; no view is infinite. |
| Story card | Title, source, metadata, summary where enabled, save/share/open actions | Open respects preview preference and publisher policy; original link is always clear. Save confirms durable/local state. |
| Preview | Allowed embed or explicitly labeled bounded reader/metadata fallback | “Reader view” is distinguished from the publisher page and includes a prominent Open original action. |
| Failure / empty | Per-source inline retry, aggregate loading/error/empty copy | A failed source never suppresses working sources. Empty copy gives the nearest useful correction (clear query, reveal sources, adjust window). |

## Sources — `/sources`

**Job:** evaluate and add publications without confusing editorial discovery with personal preference.

| Zone | Current functional inventory | Proposed presentation / acceptance |
| --- | --- | --- |
| Browse subjects | 29-topic editorial matrix grouped into eight broad areas | Present as an expandable **Browse subjects** region. It starts open for exploratory arrival, then collapses after a query or any filter is active; the reader can reopen it. Selection remains visible as a chip/result context. |
| Find and order | Search across source metadata; six sort modes | Search, sort, result count, and active constraints form one compact toolbar. Explain non-obvious sort intent on selection. |
| Advanced filters | Language, region, source type, cadence; active count and clear | On wide layouts, a compact rail; below wide desktop, a drawer/popover. It is closed by default when no advanced filter is active and retains its active-count affordance. |
| Custom source | Existing feed URL form beside the toolbar | Give it a visually distinct outlined “Add a custom source” trigger and panel. It must not look like a search filter; validate URL/feed result, duplicate, failure, and successful addition. |
| Source directory row | Number, name, description, tags, language/cadence/depth metadata, rating select, preview, add/remove | Persist **one** primary action: Add or Added. Move rating and Preview to a details drawer/overflow (or revealed row-details state). Preserve the numbered list and selected-source vertical rule. |
| Source details | Not a dedicated progressive-disclosure surface today | Shows editorial description, tags, all metadata, preview, private rating, and Remove/Hide where applicable. It explains “ratings are yours alone; directory ranks are editorial.” |

### Sources state matrix

| State | Must communicate | Available recovery |
| --- | --- | --- |
| Initial browse | Editorial categories and featured sources | Search, choose a subject, add source |
| Query/filter active | Result count, exact active constraints, taxonomy tucked away | Remove one chip or clear all; reopen subjects |
| Added | Source now feeds Read and appears in personal source order | Open Read; remove from details/menu |
| No results | No source matches current constraints | Clear filters; add a custom source |
| Custom-feed validation fails | Why it cannot be added without exposing unsafe internals | Edit URL; try another feed URL |

## Archive — `/archive`

**Job:** preserve context around material worth revisiting.

| Zone | Content and behavior | States / acceptance |
| --- | --- | --- |
| Overview | Selected collection identity plus saved/unread/annotated counts | “Everything” is an intelligible default; selected collection is reflected in heading and export scope. |
| Sidebar | Collections, create collection, export, publication, sync/recovery/account utilities | Private/public visibility and account-dependent actions are explicit. Destructive account deletion requires the existing typed confirmation. |
| List | Search; All/Unread/Starred/Annotated filters; sort; item-level reading state, star, notes, collection assignment, Markdown copy | Filter state is retained within the session; notes save with visible feedback; item actions are keyboard-accessible. |
| Export/recovery | Markdown, CSV, lossless JSON; remote recovery where applicable | Export names scope and format; recovery makes the version/date consequence clear before restore. |

## Discover — `/discover` and public pages

**Job:** find and share human context attached to a canonical source.

| Screen | Content and behavior | Acceptance |
| --- | --- | --- |
| Discover feed | Everyone/Following context, posts, community collections, sourced-clip composer | Clearly label the current local-preview boundary versus account-backed Following. No engagement-ranked claim or infinite feed. |
| Clip composer | URL, optional title, required excerpt, commentary, publish | URL and excerpt are required; source remains attached after publishing; failure does not imply publication succeeded. |
| Public collection `/c/[slug]` | Curator context, entries, follow, RSS | Visibility and attribution are clear; RSS is discoverable; inaccessible/private content is not leaked. |
| Profile `/u/[handle]` | Identity, collections, posts/interactions, follow or owner edit | Owner and visitor affordances differ without creating a separate mental model. |

## Account and onboarding

| Screen | Job | Acceptance |
| --- | --- | --- |
| Sign in | Optionally enable account features by passwordless link | Copy says reading remains usable without an account; errors and expired links lead to retry. |
| Welcome | Establish public handle/profile after authentication | Handle requirements are clear before submit; return target is safe and preserved. |
| Account menu/profile edit | Manage identity, account/session | Sign out keeps the stated local archive; deletion scope distinguishes cloud data from device-local data. |

## Accessibility release checks

Before an interface change is accepted: check normal text and metadata at WCAG 2.2 AA’s 4.5:1 contrast threshold; test non-text controls and focus treatment; test at 200% zoom/reflow; run keyboard-only and screen-reader passes through dialogs, menus, filters, row actions, and drag alternatives. The contrast and focus requirements are grounded in [WCAG 2.2](https://www.w3.org/TR/wcag/) and [W3C’s non-text contrast guidance](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html).
