# UI orchestration hotspots

Status: accepted (2026-09-09). Defines `bareaga_web-cqi`. Four components
concentrate unrelated workflows and lifecycles. This note records the
responsibility seams and size targets so extraction can happen **incrementally,
along the feature seams upcoming work already touches** — never a flag-day
component rewrite. **Add characterization tests for a workflow before moving
it.**

Rules for every slice:

- Extract a focused hook or child component; the parent stays a readable
  composition shell.
- Public behavior and accessibility are preserved — same DOM, roles, focus
  order, keyboard handling.
- `npm test` (incl. `test:ui`), `npx tsc --noEmit`, `npm run lint` stay green.

## `AppProviders.tsx` (177 → target ≤ 90 line shell)

Two independent concerns share one component: **preferences** state + persistence
and **archive** state + persistence + sync (`PersistenceQueue`,
`skipInitialPrefsSave`, retry + `replaceArchiveFromServer`).

| Seam | Extract to | Covers |
|---|---|---|
| Preferences | `usePreferencesProvider()` | `prefs`, `updatePrefs`, `prefsPersistence`, `retryPrefsPersistence` |
| Archive | `useArchiveProvider()` | `archive`, `updateArchive`, `sync`, queue wiring, both retries, `replaceArchiveFromServer` |

`AppProviders` becomes: call both hooks, memo the two context values, render the
nested providers.

Characterization first: prefs update calls `persist`; first prefs render does
**not** save; archive update enqueues; `retryArchivePersistence` /
`retrySync` / `replaceArchiveFromServer` paths.

## `ArchiveApp.tsx` (569 → target ≤ 200 line shell)

~15 `useState` across three workflows plus a nested `PublishPanel`.

| Seam | Extract to | Covers |
|---|---|---|
| Browse | `useArchiveFilters(items)` | `query`, `filter`, `sort`, `collectionId`, the `visible` / `counts` / `collectionItems` memos |
| Recovery | `useArchiveRecovery()` | `revisions`, `contentSnapshots`, `recoveryBusy`, their load effect |
| Publishing | `usePublications()` | `publications`, `publishBusy`, `postsByItem` |
| `PublishPanel` | `ArchivePublishPanel.tsx` | its own file, unchanged |

Characterization first: a filter/sort/collection change narrows the rendered
list; recovery list loads; publish + unpublish round-trips.

## `NewsApp.tsx` (496 → target ≤ 220 line shell)

Feed lifecycle is already in `useFeedQuery`. Remaining tangle: prefs
persistence, search-field hydration + keyboard focus, back-to-top scroll,
slash-command wiring, reorder, share/save.

| Seam | Extract to | Covers |
|---|---|---|
| Prefs writes | `useNewsPrefs()` | `persist`, `changeTopic`, `onSearchChange` (+ debounce) |
| Search field | `useSearchField()` | `searchInputRef`, `searchHydrated`, `focusSearch`, the `/` keyboard effect |
| Scroll affordance | `useBackToTop()` | `showBackToTop` + its scroll listener |

`shareStory` / `saveStory` / `onReorder` are already thin — leave them.

Characterization first: search hydrates from `prefs` once; `/` focuses the
search input; a topic change persists; back-to-top appears past the threshold.

## `SettingsPanel.tsx` (569 → target ≤ 200 line shell + one file per tab)

Modal shell + tab router + source-directory search + import/export status, with
`RankingControls` (~90 lines) and `ChoiceRow` / `ToggleRow` inline.

| Seam | Extract to | Covers |
|---|---|---|
| Modal mechanics | `useModalDialog` (already exists) | `panelRef`, `closeRef`, Escape, focus trap |
| Row primitives | `SettingsControls.tsx` | `ChoiceRow`, `ToggleRow` |
| Ranking tab | `RankingControls.tsx` | its own file, unchanged |
| Each tab body | `settings/<Tab>Panel.tsx` | one component per `SettingsTab` |

`SettingsPanel` becomes: `useModalDialog`, tab state, render the active tab
panel.

Characterization first: Escape closes; focus is trapped within the panel; tab
switch swaps the body; import status message renders.

## Follow-ups

One bead per hotspot, plus a characterization-test task that must land before
its extraction. Filed under `cqi`.
