import type {
  ColumnCount,
  DensityId,
  FontId,
  HomeViewId,
  KeywordRule,
  PaletteId,
  PrefsStore,
  StoryRepresentationId,
  ThemeMode,
  UserPrefs,
} from "./types";
import { catalogSourceIds, defaultSourceOrder, storedSourceOrder } from "./sources";

const STORAGE_KEY = "bareaga.prefs.v1";
const LEGACY_STORAGE_KEY = "brp.prefs.v1";

const THEMES: ThemeMode[] = ["system", "light", "dark"];
const FONTS: FontId[] = ["mono", "sans", "serif", "slab"];
const PALETTES: PaletteId[] = ["ink", "paper", "terminal", "copper", "rose"];
const DENSITIES: DensityId[] = ["comfortable", "compact"];
const COLUMNS: ColumnCount[] = [1, 2, 3, 4];
const HOME_VIEWS: HomeViewId[] = ["grid", "top", "focus", "ranked"];
const STORY_REPRESENTATIONS: StoryRepresentationId[] = ["compact", "detailed"];

export const DEFAULT_PREFS: UserPrefs = {
  version: 1,
  sourceOrder: defaultSourceOrder(),
  hiddenSources: [],
  theme: "system",
  limit: 10,
  hours: 24,
  lastSearch: "",
  showSummaries: false,
  showAuthors: false,
  showAges: true,
  showEngagement: true,
  columns: 3,
  homeView: "grid",
  storyRepresentation: "detailed",
  font: "mono",
  palette: "ink",
  density: "comfortable",
  keywordRules: [],
  sourceWeights: {},
  sourceRatings: {},
};

export const HOME_VIEW_OPTIONS: { id: HomeViewId; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "top", label: "Top" },
  { id: "focus", label: "Focus" },
  { id: "ranked", label: "Ranked" },
];

function sanitizeKeywordRules(value: unknown): KeywordRule[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(catalogSourceIds());
  return value.flatMap((candidate): KeywordRule[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<KeywordRule>;
    const term = typeof raw.term === "string" ? raw.term.trim().slice(0, 80) : "";
    const weight = Number(raw.weight);
    if (!term || !Number.isFinite(weight) || weight === 0) return [];
    const sourceId =
      typeof raw.sourceId === "string" && known.has(raw.sourceId)
        ? raw.sourceId
        : undefined;
    return [{ term, weight: Math.max(-10, Math.min(10, weight)), sourceId }];
  }).slice(0, 100);
}

function sanitizeSourceWeights(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const weights: Record<string, number> = {};
  for (const id of catalogSourceIds()) {
    const weight = Number(raw[id]);
    if (Number.isFinite(weight) && weight !== 1) {
      weights[id] = Math.max(0.5, Math.min(1.5, weight));
    }
  }
  return weights;
}

function sanitizeSourceRatings(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const ratings: Record<string, number> = {};
  for (const id of catalogSourceIds()) {
    const rating = Number(raw[id]);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      ratings[id] = rating;
    }
  }
  return ratings;
}

export const STORY_REPRESENTATION_OPTIONS: {
  id: StoryRepresentationId;
  label: string;
  hint: string;
}[] = [
  { id: "compact", label: "Compact", hint: "Headline and essential metadata" },
  { id: "detailed", label: "Detailed", hint: "Headline, metadata, and summary" },
];

function pick<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Sanitize partial prefs (load, import). Unknown ids/values fall back to defaults. */
export function mergeWithDefaults(raw: Partial<UserPrefs> | null): UserPrefs {
  const base: UserPrefs = {
    ...DEFAULT_PREFS,
    sourceOrder: [...DEFAULT_PREFS.sourceOrder],
    hiddenSources: [],
  };
  if (!raw || raw.version !== 1) return base;

  const known = new Set(catalogSourceIds());
  const order = storedSourceOrder(raw.sourceOrder) ?? base.sourceOrder;

  const legacy = raw as Omit<Partial<UserPrefs>, "homeView"> & {
    homeView?: HomeViewId | "grid" | "gallery";
    galleryObjectBar?: string;
  };
  const homeView =
    legacy.homeView === "gallery"
      ? "focus"
      : pick(legacy.homeView as HomeViewId, HOME_VIEWS, "grid");
  const legacyRepresentation = ["rows", "index", "ticks"].includes(
    legacy.galleryObjectBar ?? ""
  )
    ? "compact"
    : "detailed";

  return {
    version: 1,
    sourceOrder: order,
    hiddenSources: (raw.hiddenSources ?? []).filter((id) => known.has(id)),
    theme: pick(raw.theme, THEMES, "system"),
    limit: [5, 10, 15, 25, 50].includes(raw.limit as number)
      ? (raw.limit as number)
      : 10,
    hours: [1, 3, 6, 12, 24, 48, 72].includes(raw.hours as number)
      ? (raw.hours as number)
      : 24,
    lastSearch: typeof raw.lastSearch === "string" ? raw.lastSearch : "",
    showSummaries:
      typeof raw.showSummaries === "boolean"
        ? raw.showSummaries
        : DEFAULT_PREFS.showSummaries,
    showAuthors:
      typeof raw.showAuthors === "boolean"
        ? raw.showAuthors
        : DEFAULT_PREFS.showAuthors,
    showAges:
      typeof raw.showAges === "boolean" ? raw.showAges : DEFAULT_PREFS.showAges,
    showEngagement:
      typeof raw.showEngagement === "boolean"
        ? raw.showEngagement
        : DEFAULT_PREFS.showEngagement,
    columns: pick(raw.columns as ColumnCount, COLUMNS, 3),
    homeView,
    storyRepresentation: pick(
      raw.storyRepresentation,
      STORY_REPRESENTATIONS,
      legacy.galleryObjectBar
        ? legacyRepresentation
        : DEFAULT_PREFS.storyRepresentation
    ),
    font: pick(raw.font, FONTS, "mono"),
    palette: pick(raw.palette, PALETTES, "ink"),
    density: pick(raw.density, DENSITIES, "comfortable"),
    keywordRules: sanitizeKeywordRules(raw.keywordRules),
    sourceWeights: sanitizeSourceWeights(raw.sourceWeights),
    sourceRatings: sanitizeSourceRatings(raw.sourceRatings),
  };
}

/** Browser localStorage adapter. Swap for CloudPrefsStore when accounts land. */
export class LocalPrefsStore implements PrefsStore {
  async load(): Promise<UserPrefs> {
    if (typeof window === "undefined") return { ...DEFAULT_PREFS };
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const prefs = mergeWithDefaults(
        raw ? (JSON.parse(raw) as Partial<UserPrefs>) : null
      );
      // Migrate legacy key once
      if (
        !window.localStorage.getItem(STORAGE_KEY) &&
        window.localStorage.getItem(LEGACY_STORAGE_KEY)
      ) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      }
      return prefs;
    } catch {
      return { ...DEFAULT_PREFS, sourceOrder: defaultSourceOrder() };
    }
  }

  async save(prefs: UserPrefs): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }
}

let store: PrefsStore | null = null;

/** Prefs backend. UI only depends on PrefsStore — swap implementation when cloud sync lands. */
export function getPrefsStore(): PrefsStore {
  if (!store) store = new LocalPrefsStore();
  return store;
}

export const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: "mono", label: "Mono" },
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "slab", label: "Slab" },
];

export const PALETTE_OPTIONS: { id: PaletteId; label: string }[] = [
  { id: "ink", label: "Ink" },
  { id: "paper", label: "Paper" },
  { id: "terminal", label: "Terminal" },
  { id: "copper", label: "Copper" },
  { id: "rose", label: "Rose" },
];
