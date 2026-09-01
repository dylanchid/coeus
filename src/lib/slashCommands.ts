import {
  FONT_OPTIONS,
  HOME_VIEW_OPTIONS,
  PALETTE_OPTIONS,
  STORY_REPRESENTATION_OPTIONS,
} from "./prefs";
import {
  DEFAULT_SOURCES,
  TOPICS,
  type Topic,
} from "./sources";
import { fuzzyScoreMulti } from "./fuzzy";
import type {
  ColumnCount,
  DensityId,
  FontId,
  HomeViewId,
  PaletteId,
  SourceFeed,
  StoryRepresentationId,
  ThemeMode,
  UserPrefs,
} from "./types";

export type SlashGroup =
  | "Actions"
  | "Topics"
  | "Display"
  | "Look"
  | "Feed"
  | "Sources"
  | "Articles";

export type SlashItem = {
  id: string;
  label: string;
  group: SlashGroup;
  /** Extra text for fuzzy matching */
  keywords?: string;
  /** Right-side meta (shortcut, current value) */
  hint?: string;
  /** Shown when the query is empty */
  primary?: boolean;
  run: () => void;
};

export type SlashBuildContext = {
  prefs: UserPrefs;
  topic: Topic;
  search: string;
  sources: SourceFeed[];
  busy: boolean;
  onPrefs: (patch: Partial<UserPrefs>) => void;
  onTopic: (t: Topic) => void;
  onSearch: (q: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onFocusSearch: () => void;
  onExportPrefs: () => void;
};

const LIMITS = [5, 10, 15, 25, 50] as const;
const HOURS = [1, 3, 6, 12, 24, 48, 72] as const;
const COLUMNS: ColumnCount[] = [1, 2, 3, 4];
const GROUP_ORDER: SlashGroup[] = [
  "Actions",
  "Topics",
  "Display",
  "Look",
  "Feed",
  "Sources",
  "Articles",
];

function toggleHidden(
  prefs: UserPrefs,
  id: string,
  onPrefs: (p: Partial<UserPrefs>) => void
) {
  const set = new Set(prefs.hiddenSources);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  onPrefs({ hiddenSources: [...set] });
}

export function buildSlashItems(ctx: SlashBuildContext): SlashItem[] {
  const {
    prefs,
    topic,
    search,
    sources,
    busy,
    onPrefs,
    onTopic,
    onSearch,
    onRefresh,
    onOpenSettings,
    onFocusSearch,
    onExportPrefs,
  } = ctx;

  const items: SlashItem[] = [];

  // —— Actions ——
  items.push({
    id: "action:refresh",
    label: busy ? "Refresh feeds (busy…)" : "Refresh feeds",
    group: "Actions",
    keywords: "reload update force fetch",
    hint: "R",
    primary: true,
    run: () => {
      if (!busy) onRefresh();
    },
  });
  items.push({
    id: "action:search",
    label: "Focus keyword search",
    group: "Actions",
    keywords: "find filter headlines titles",
    hint: "?",
    primary: true,
    run: () => onFocusSearch(),
  });
  items.push({
    id: "action:clear-search",
    label: search.trim() ? `Clear search (“${search.trim().slice(0, 24)}”)` : "Clear search",
    group: "Actions",
    keywords: "reset filter empty",
    primary: true,
    run: () => onSearch(""),
  });
  items.push({
    id: "action:settings",
    label: "Open settings",
    group: "Actions",
    keywords: "preferences config panel",
    hint: ",",
    primary: true,
    run: () => onOpenSettings(),
  });
  items.push({
    id: "action:export",
    label: "Export preferences JSON",
    group: "Actions",
    keywords: "backup download prefs",
    primary: true,
    run: () => onExportPrefs(),
  });

  // —— Topics ——
  for (const t of TOPICS) {
    const label = t[0]!.toUpperCase() + t.slice(1);
    items.push({
      id: `topic:${t}`,
      label: `Topic: ${label}`,
      group: "Topics",
      keywords: `filter category ${t}`,
      hint: topic === t ? "current" : undefined,
      primary: true,
      run: () => onTopic(t),
    });
  }

  // —— Display: homescreen layout ——
  for (const v of HOME_VIEW_OPTIONS) {
    items.push({
      id: `homeView:${v.id}`,
      label: `Homescreen: ${v.label}`,
      group: "Display",
      keywords: `stories ordering homescreen balanced recent ${v.id}`,
      hint: prefs.homeView === v.id ? "current" : undefined,
      primary: true,
      run: () => onPrefs({ homeView: v.id as HomeViewId }),
    });
  }

  for (const columns of COLUMNS) {
    items.push({
      id: `columns:${columns}`,
      label: `Grid columns: ${columns}`,
      group: "Display",
      keywords: `grid layout columns ${columns}`,
      hint: prefs.columns === columns ? "current" : undefined,
      primary: prefs.homeView === "grid" && prefs.columns === columns,
      run: () => onPrefs({ homeView: "grid", columns }),
    });
  }

  for (const o of STORY_REPRESENTATION_OPTIONS) {
    items.push({
      id: `storyRepresentation:${o.id}`,
      label: `Stories: ${o.label}`,
      group: "Display",
      keywords: `stories representation density ${o.id} ${o.hint}`,
      hint: prefs.storyRepresentation === o.id ? "current" : o.hint,
      primary: prefs.homeView !== "grid",
      run: () =>
        onPrefs({
          storyRepresentation: o.id as StoryRepresentationId,
        }),
    });
  }

  // —— Display toggles ——
  const toggles: Array<{
    id: keyof UserPrefs;
    label: string;
    keywords: string;
    on: boolean;
  }> = [
    {
      id: "showSummaries",
      label: "Summaries",
      keywords: "lede description blurb",
      on: prefs.showSummaries,
    },
    {
      id: "showAuthors",
      label: "Authors",
      keywords: "byline writer",
      on: prefs.showAuthors,
    },
    {
      id: "showAges",
      label: "Age labels",
      keywords: "time ago relative",
      on: prefs.showAges,
    },
    {
      id: "showEngagement",
      label: "Engagement chips",
      keywords: "points comments score hn",
      on: prefs.showEngagement,
    },
  ];
  for (const t of toggles) {
    items.push({
      id: `display:${t.id}`,
      label: `${t.on ? "Hide" : "Show"} ${t.label.toLowerCase()}`,
      group: "Display",
      keywords: `${t.label} ${t.keywords} toggle`,
      hint: t.on ? "on" : "off",
      primary: prefs.homeView === "grid",
      run: () => onPrefs({ [t.id]: !t.on } as Partial<UserPrefs>),
    });
  }

  for (const d of ["comfortable", "compact"] as DensityId[]) {
    items.push({
      id: `density:${d}`,
      label: `Density: ${d === "comfortable" ? "Comfortable" : "Compact"}`,
      group: "Display",
      keywords: `spacing tight ${d}`,
      hint: prefs.density === d ? "current" : undefined,
      primary: d === prefs.density,
      run: () => onPrefs({ density: d }),
    });
  }

  // —— Look ——
  for (const theme of ["system", "light", "dark"] as ThemeMode[]) {
    items.push({
      id: `theme:${theme}`,
      label: `Theme: ${theme}`,
      group: "Look",
      keywords: `appearance color scheme ${theme}`,
      hint: prefs.theme === theme ? "current" : undefined,
      primary: theme === prefs.theme,
      run: () => onPrefs({ theme }),
    });
  }
  for (const p of PALETTE_OPTIONS) {
    items.push({
      id: `palette:${p.id}`,
      label: `Palette: ${p.label}`,
      group: "Look",
      keywords: `colors ${p.id} ${p.label}`,
      hint: prefs.palette === p.id ? "current" : undefined,
      primary: p.id === prefs.palette,
      run: () => onPrefs({ palette: p.id as PaletteId }),
    });
  }
  for (const f of FONT_OPTIONS) {
    items.push({
      id: `font:${f.id}`,
      label: `Font: ${f.label}`,
      group: "Look",
      keywords: `typeface typography ${f.id}`,
      hint: prefs.font === f.id ? "current" : undefined,
      primary: f.id === prefs.font,
      run: () => onPrefs({ font: f.id as FontId }),
    });
  }

  // —— Feed ——
  for (const n of LIMITS) {
    items.push({
      id: `limit:${n}`,
      label: `Articles per source: ${n}`,
      group: "Feed",
      keywords: `limit count ${n}`,
      hint: prefs.limit === n ? "current" : undefined,
      primary: n === prefs.limit,
      run: () => onPrefs({ limit: n }),
    });
  }
  for (const h of HOURS) {
    items.push({
      id: `hours:${h}`,
      label: `Time window: ${h}h`,
      group: "Feed",
      keywords: `hours age window ${h}`,
      hint: prefs.hours === h ? "current" : undefined,
      primary: h === prefs.hours,
      run: () => onPrefs({ hours: h }),
    });
  }

  // —— Sources ——
  items.push({
    id: "sources:show-all",
    label: "Show all sources",
    group: "Sources",
    keywords: "unhide enable every",
    primary: true,
    run: () => onPrefs({ hiddenSources: [] }),
  });
  items.push({
    id: "sources:hide-all",
    label: "Hide all sources",
    group: "Sources",
    keywords: "disable clear columns",
    primary: false,
    run: () =>
      onPrefs({ hiddenSources: DEFAULT_SOURCES.map((s) => s.id) }),
  });
  const hidden = new Set(prefs.hiddenSources);
  for (const s of DEFAULT_SOURCES) {
    const isHidden = hidden.has(s.id);
    items.push({
      id: `source-toggle:${s.id}`,
      label: `${isHidden ? "Show" : "Hide"} ${s.name}`,
      group: "Sources",
      keywords: `${s.name} ${s.id} ${s.topic} toggle source feed`,
      hint: isHidden ? "hidden" : s.topic,
      primary: false,
      run: () => toggleHidden(prefs, s.id, onPrefs),
    });
  }

  // —— Articles (loaded headlines) ——
  for (const src of sources) {
    for (const a of src.articles) {
      items.push({
        id: `article:${a.id}`,
        label: a.title,
        group: "Articles",
        keywords: [
          src.name,
          a.author,
          a.summary,
          a.engagement
            ? `${a.engagement.points ?? ""} pts ${a.engagement.comments ?? ""} comments`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        hint: src.name,
        primary: false,
        run: () => {
          window.open(a.url, "_blank", "noopener,noreferrer");
        },
      });
    }
  }

  return items;
}

export type RankedSlashItem = SlashItem & { score: number };

/**
 * Filter + rank items for the current query.
 * Empty query → primary commands only (keep the menu scannable).
 */
export function filterSlashItems(
  items: SlashItem[],
  query: string,
  opts?: { articleLimit?: number }
): RankedSlashItem[] {
  const q = query.trim();
  const articleLimit = opts?.articleLimit ?? 12;

  if (!q) {
    return items
      .filter((i) => i.primary)
      .map((i) => ({ ...i, score: 0 }))
      .sort(
        (a, b) =>
          GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
      );
  }

  const nonArticles: RankedSlashItem[] = [];
  const articles: RankedSlashItem[] = [];

  for (const item of items) {
    const score = fuzzyScoreMulti(q, item.label, item.keywords, item.hint);
    if (score === null) continue;
    const rankedItem = { ...item, score };
    if (item.group === "Articles") articles.push(rankedItem);
    else nonArticles.push(rankedItem);
  }

  articles.sort((a, b) => b.score - a.score);
  const ranked = [...nonArticles, ...articles.slice(0, articleLimit)];
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
  });

  return ranked;
}

export function groupRankedItems(
  ranked: RankedSlashItem[]
): { group: SlashGroup; items: RankedSlashItem[] }[] {
  const map = new Map<SlashGroup, RankedSlashItem[]>();
  for (const item of ranked) {
    const list = map.get(item.group) ?? [];
    list.push(item);
    map.set(item.group, list);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((group) => ({
    group,
    items: map.get(group)!,
  }));
}
