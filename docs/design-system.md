# Coeus design system

**Status:** specification for `bareaga_web-cfp`, following the [art direction](art-direction.md). The tokens below describe the target architecture. Existing CSS in `src/styles/base.css` remains the runtime source until each token group is migrated.

## Principles and ownership

Coeus is a configurable reading surface with a consistent editorial frame. Readers may choose theme, palette, font, and density; every choice must preserve readable text, clear state, and predictable control placement. Source names, story titles, and the original link lead. Metadata and configuration recede without disappearing.

| Layer | Owns | Example | Rule |
| --- | --- | --- | --- |
| Primitive | Raw color, size, font, and motion values | `--color-ink-950`, `--size-4` | Defined once; no screen meaning. |
| Semantic | Roles that change with theme/palette/density | `--surface-page`, `--text-secondary`, `--space-item` | Components consume these roles. |
| Component | A component's local interpretation | `--story-border`, `--dialog-surface` | Alias semantic tokens; override only for a documented variant. |

Keep the current public preference ids and `data-theme`, `data-palette`, `data-font`, and `data-density` attributes. Introduce aliases incrementally; do not rename every selector in one pass. `@base-ui/react` supplies interaction behavior through wrappers in `src/components/ui/`, while Coeus CSS owns appearance. Do not add MUI, shadcn, or Tailwind; this is the accepted `bareaga_web-cfp` decision.

## Color roles

The following maps target role names to current variables. During migration, aliases can point to the existing variables; a later palette audit may adjust raw colors without changing component code.

| Semantic role | Current variable | Use |
| --- | --- | --- |
| `--surface-page` | `--bg` | Reading canvas and page background. |
| `--surface-raised` | `--settings-bg` | Dialogs, sheets, menus, and strong inset panels. |
| `--surface-inverse` | `--fg` | Filled selected controls and badges. |
| `--text-primary` | `--fg` | Titles, body copy, selected labels. |
| `--text-secondary` | `--muted` | Metadata and supporting copy; still normal readable text. |
| `--text-inverse` | `--bg` | Text on inverse filled controls. |
| `--text-accent` | `--accent` | Sparse editorial accent labels. |
| `--text-link` | `--link` | Openable article and navigation links. |
| `--text-visited` | `--visited` | Visited article links. |
| `--text-danger` | `--error` | Actionable error text. |
| `--rule-subtle` | `--line` | Row and section dividers. |
| `--rule-strong` | `--header-rule` | Section starts, selected rails, dialog edges. |
| `--rule-panel` | `--settings-border` | Raised panel and menu edges. |
| `--focus-ring` | `--accent` initially | Keyboard focus; audit separately in each palette. |
| `--highlight` | `--mark` | Search and matched-term highlights. |

Ink is the default dark palette; Paper is the warm light option. Terminal, Copper, and Rose retain their current identities. `system` follows the OS color scheme unless a palette explicitly sets its own scheme, matching current behavior. In any palette, a selected control needs a shape, rule, weight, or state label in addition to color. A disabled control remains legible enough to identify, and an error includes text rather than color alone.

Before migrating a palette, measure primary and secondary text against their actual composed surfaces at **4.5:1** for normal text, and control boundaries and focus indicators at **3:1** where the non-text criterion applies. Test visited links as text. Do not infer contrast from the Ink palette for the others.

## Typography

The installed faces in `src/app/layout.tsx` are the allowed font inventory for this phase: IBM Plex Mono, DM Sans, Newsreader, Roboto Slab, Syne, and Pochaevsk. The four user-facing font modes and their CSS mappings are in `src/styles/base.css`. Pochaevsk stays scoped to the wordmark in `src/styles/shell.css`.

| Role | Target size / line height | Weight and treatment | Current relationship |
| --- | --- | --- | --- |
| Small label | `0.75rem / 1.35` | 600, optional uppercase with restrained tracking | Replaces the smallest `0.7rem` kicker where legibility suffers. |
| Metadata | `0.8125rem / 1.4` | 400, tabular numbers for counts and time | Target for current `--text-meta: 0.72rem`. |
| Control | `0.875rem / 1.3` | 600 for selected or primary | Keep a 44px target independent of text size. |
| Story/body | `1rem / 1.5` comfortable; `0.9375rem / 1.45` compact | 400–600 by selected font | Target for current `--text-body: 0.9rem`. |
| Section heading | `clamp(1.5rem, 2.5vw, 2.25rem) / 1.15` | 600–700 | Smaller than the product display scale. |
| Page heading | `clamp(2rem, 4vw, 3.5rem) / 1.08` | 600–700 | Use once per page. |
| Editorial display | `clamp(3rem, 8vw, 7.2rem) / 0.98–1.08` | Face-specific | Reserved for sparse product or cover layouts. |

These are migration targets, not a command to resize all existing text at once. User font selection applies to article titles and reading copy. Short UI labels may use IBM Plex Mono consistently. Tune line height and letter spacing for each mode; do not assume the mono values fit Newsreader or Syne. Long reading should have a maximum measure near 65–75 characters, with a shorter measure for small screens. Avoid justified text and arbitrary truncation of article titles.

## Spacing, rules, and density

Use a 4px base with purposeful steps rather than per-screen values. The current `--space-*` scale can be aliased while migration proceeds.

| Primitive | Value | Main use |
| --- | --- | --- |
| `--size-1` | `0.25rem` (4px) | Tight icon/text adjustment. |
| `--size-2` | `0.5rem` (8px) | Within metadata and small control groups. |
| `--size-3` | `0.75rem` (12px) | Compact row rhythm. |
| `--size-4` | `1rem` (16px) | Standard component padding. |
| `--size-6` | `1.5rem` (24px) | Between related groups. |
| `--size-8` | `2rem` (32px) | Section separation. |
| `--size-12` | `3rem` (48px) | Page-level separation. |
| `--size-16` | `4rem` (64px) | Sparse editorial regions only. |

| Semantic role | Comfortable | Compact | Applies to |
| --- | --- | --- | --- |
| `--space-item` | 16px | 12px | Between story or archive rows. |
| `--space-group` | 24px | 16px | Between source groups or related panels. |
| `--space-section` | 48px | 32px | Major page sections. |
| `--space-inline` | `clamp(16px, 2vw, 24px)` | Same | Page gutters; density does not squeeze the viewport edge. |
| `--target-min` | 44px | 44px | Interactive hit areas, including icon controls. |

Use 1px rules for ordinary separation and 2px only when a state or section boundary requires it. Keep the existing square corner language (`--radius: 0`) as the default. Avoid a shadow as the only boundary; dialogs and menus need a visible rule against every palette. Motion tokens should be `--motion-fast: 120ms` for direct feedback and `--motion-standard: 200ms` for panel state changes, with no essential information carried by animation. Under `prefers-reduced-motion: reduce`, remove nonessential movement.

## Responsive layout

These are layout contracts, not device names. Existing components use additional local breakpoints; consolidate them only when their screens migrate.

| Width | Reader grid | Shell and controls | Current anchor |
| --- | --- | --- | --- |
| `≤700px` | One source column | Compact header, sticky search, settings bottom sheet with safe-area padding | `src/styles/responsive.css` at 700px. |
| `701–1000px` | At most two columns, respecting the user's lower column choice | Navigation and controls wrap without hiding state | `src/styles/responsive.css` at 1000px. |
| `>1000px` | User-selected columns, subject to readable minimum width | Full toolbar and wider source grid | Current `--cols` and `--content-max`. |

At 320–375px, no horizontal page overflow or clipped primary action. At 200% zoom, allow controls to wrap and content to reflow rather than freezing desktop columns. Modal and sticky controls must not obscure focused content. Reader, Archive, Sources, and public pages may use different inner grids, but share page gutters and type roles.

## Component state contract

| Component | Rest | Hover / active | Selected / expanded | Disabled / error | Keyboard |
| --- | --- | --- | --- | --- | --- |
| Link | Link role and clear destination text | Underline or stronger rule without layout shift | Visited uses visited role | Error copy beside affected action | Visible focus ring; Enter follows. |
| Button | Text or outlined default; one filled primary per local decision | Border/text change, no moving bounds | `aria-pressed` where toggled | Native `disabled`; error text near action | 44px target; Enter/Space. |
| Tabs / segmented choice | Every option readable | Rule or weight change | Visible selected marker and programmatic state | Unavailable option explained | Arrow-key behavior through the chosen primitive. |
| Input / search | Label or clear accessible name; rule/border | Border strengthens on interaction | Current query and result context visible | Inline error and recovery | Focus ring; Escape only where documented. |
| Dialog / sheet | Raised surface, strong edge, heading | No hover-only reveal | Open state traps focus | Submit errors preserve input | Escape closes; focus returns to trigger. |
| Story / source row | Title and source lead | Row actions appear or strengthen without hiding baseline action | Saved/added state uses text and shape | Failure leaves retry available | All actions reachable in reading order. |

The [screen specifications](ux/screen-specifications.md) own detailed screen behavior. This table owns visual state consistency; it does not replace the behavior contract.

## Review matrix for each migrated screen

| Dimension | Required cases | Pass condition |
| --- | --- | --- |
| Palette and scheme | Ink dark; Paper light and dark; Terminal, Copper, Rose | Text, links, visited state, rules, controls, focus, and error pass their role checks. |
| Font | Mono, Sans, Serif, Slab | Titles and controls wrap without collision or truncation; line height remains readable. |
| Density | Comfortable and Compact | Story count changes through spacing/fields, while controls stay at least 44px. |
| Width and zoom | 375px, 700px, 1000px, 1440px; 200% zoom | No lost action, horizontal page overflow, or hidden focus target. |
| Input and motion | Mouse, keyboard, touch; reduced motion | State is visible without hover or animation; focus order matches visual order. |
| Content states | Loading, empty, partial failure, saved/selected, long title | The next useful action and current state remain clear. |

Prioritize representative combinations for visual review, then run automated contrast checks across every palette/scheme role combination. For a component migration, record any intentional local exception beside its CSS so the exception can be reviewed later.

## Migration sequence

1. Add primitive and semantic aliases to `base.css` and verify computed values match existing preferences.
2. Build `src/components/ui/` wrappers for button, input, dialog, and tabs with the state contract above.
3. Migrate the global shell and Reader, then Sources, Archive, Discover, and public pages. Review one screen at a time against the matrix.
4. Remove obsolete raw values only after every consumer has moved. Keep preference migration behavior stable throughout.

The first implementation slice is `bareaga_web-cfp.1` (semantic palette aliases and shared shell); `bareaga_web-cfp.2` adds the first Base UI button/dialog wrappers and migrates sign-in. Continue screen migration against the review matrix rather than replacing every control at once.
