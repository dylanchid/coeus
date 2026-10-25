# Coeus art direction

**Status:** accepted direction for the design-system and UI-refactor phase. This is a design specification; screen changes are not implemented here.

## Reading experience

Coeus should feel like a personal newspaper desk: many independent sources, clear rules, and enough quiet space to choose what to read. Keep the source name and article title as the strongest elements in the Reader. Treat counts, age, and controls as supporting information. Use typography, alignment, and hairline rules for hierarchy; reserve filled surfaces for dialogs, selected states, and actions that need emphasis.

The existing [UX direction](ux/README.md) sets the product language: paper ground, near-black rules, restrained links, numbered lists, and progressive disclosure. The historical [`bareaga-home-desktop.png`](../bareaga-home-desktop.png), [`bareaga-home-mobile.png`](../bareaga-home-mobile.png), and [`bareaga-settings-mobile.png`](../bareaga-settings-mobile.png) show the dense newsroom origin. They are references for rhythm and hierarchy, not pixel targets for the current Coeus routes. Current implementation evidence is in `src/styles/base.css`, `src/styles/responsive.css`, and `src/app/layout.tsx`.

## Type direction

| Role | Direction | Reason |
| --- | --- | --- |
| Wordmark | Pochaevsk at the current mixed-case size | Preserves the shared shell's existing identity. |
| Short section heads | IBM Plex Mono, bold; restrained tracking | Keeps the recognizable utilitarian voice around content. |
| Reader titles | The selected user font, with weight and line height tuned per font | A user's font choice must reach the content they scan most. Avoid forcing one display face on every story. |
| Navigation, controls, metadata | IBM Plex Mono for short labels and tabular numbers | Gives repeated controls a stable rhythm across font preferences. |
| Long article or note reading | Newsreader when `serif` is selected; the selected font otherwise | Supports comfortable reading without breaking the existing font setting. |
| Product/editorial display | Syne with DM Sans in the `sans` mode; Newsreader in the `serif` mode | The installed faces already support a distinct display voice on sparse pages. |

The four shipped choices remain **Mono** (IBM Plex Mono), **Sans** (DM Sans/Syne), **Serif** (Newsreader), and **Slab** (Roboto Slab). Pochaevsk is already used for the shared wordmark and stays scoped to that role. Do not introduce another font download in this phase. Keep body and metadata legible at 200% zoom; the current 0.7–0.72rem label sizes need review during screen migration.

## Density and composition

| Setting | Reader intent | Fixed interaction rule |
| --- | --- | --- |
| Comfortable | 16px minimum story text, more separation between stories and source groups, summaries easy to scan | Controls retain a 44px target; title lines do not collide with metadata. |
| Compact | More stories in one bounded session through reduced gaps and optional fields | Preserve readable type and the same control target. Do not shrink text merely to fit more rows. |

At wide widths, source columns have equal authority and a visible rule or gap between groups. At medium widths, cap the Reader at two columns; on narrow screens, use one. Keep article reading to a narrower measure than the source grid. Allow asymmetric display composition on About or collection covers, but keep lists in predictable scan order. The exact breakpoints and measurements belong in [the design system](design-system.md).

## Color, surfaces, and motion

The five shipped palettes—Ink, Paper, Terminal, Copper, and Rose—are user choices. Their colors must map to the same semantic roles so a selected or failed control reads the same way in each palette. Keep accent color scarce: links, current state, focus, and a single primary action. Avoid decorative gradients, glass effects, and scroll reveals in the reading flow. Motion should confirm a state change and respect reduced-motion preferences.

## Application order

1. Define roles and token aliases without changing the user's existing theme, palette, font, or density setting.
2. Build Base UI-backed controls with the product's own CSS, as decided in `bareaga_web-cfp`.
3. Migrate the global shell and one content-heavy screen, comparing phone and desktop at both densities and in light and dark palettes.
4. Extend the same roles to Archive, Sources, Discover, and public pages; review contrast, focus, zoom, and keyboard use as each screen moves.

The [screen specifications](ux/screen-specifications.md) remain the interaction contract. Art direction must not hide actions or metadata needed for a reader to understand the current state.
