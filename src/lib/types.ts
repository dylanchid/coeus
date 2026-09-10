export type ThemeMode = "system" | "light" | "dark";

export type FontId = "mono" | "sans" | "serif" | "slab";

export type PaletteId = "ink" | "paper" | "terminal" | "copper" | "rose";

export type DensityId = "comfortable" | "compact";

export type ColumnCount = 1 | 2 | 3 | 4;

/** Story ordering on the homescreen. */
export type HomeViewId = "grid" | "top" | "focus" | "ranked";

/** Amount of information shown for a story. */
export type StoryRepresentationId = "compact" | "detailed";

/** How Reader headlines should open after the reader makes an initial choice. */
export type ArticlePreviewMode = "ask" | "preview" | "external";

/** Live, conservative assessment of whether an article permits framing. */
export type EmbedCompatibility = "allowed" | "blocked" | "unknown";

export interface SourceDef {
  id: string;
  name: string;
  feedUrl: string;
  /** Broad reader topic used by the home toolbar. */
  topic: string;
  /** Rich discovery categories; the first value is the primary category. */
  topics: string[];
  tags: string[];
  homeUrl: string;
  description: string;
  language: string;
  region: string;
  sourceType: "publisher" | "community" | "primary-source" | "research";
  cadence: "live" | "daily" | "weekly";
  depth: "brief" | "mixed" | "deep";
  /** Curated ordering only; not presented as a community score. */
  defaultRank: number;
}

/** Popularity signal — points/comments/shares, never fabricated page views. */
export interface Engagement {
  points?: number;
  comments?: number;
  discussionUrl?: string;
  provider?: "hn" | "rss" | "reddit";
  providerId?: string;
}

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  summary: string;
  author: string;
  publishedAt: string | null; // ISO
  ageLabel: string;
  engagement?: Engagement;
}

/** An inspectable ranking rule. Positive weights boost; negative weights mute. */
export interface KeywordRule {
  term: string;
  weight: number;
  /** Limit this rule to one source; omitted means every source. */
  sourceId?: string;
}

export interface SourceFeed {
  id: string;
  name: string;
  topic: string;
  homeUrl?: string;
  articles: Article[];
  error?: string;
}

export interface UserPrefs {
  version: 1;
  /** User-added RSS/Atom sources, persisted alongside the built-in catalog. */
  customSources: SourceDef[];
  sourceOrder: string[];
  hiddenSources: string[];
  theme: ThemeMode;
  limit: number;
  hours: number;
  lastSearch: string;
  /** Show article summaries under titles */
  showSummaries: boolean;
  /** Show author when feed provides one */
  showAuthors: boolean;
  /** Show relative age labels like [3h] */
  showAges: boolean;
  /** Show engagement chips (HN points/comments, etc.) */
  showEngagement: boolean;
  /** Legacy layout preference retained for imported preference files. */
  columns: ColumnCount;
  /** Reading layout: source Grid, balanced Top, or newest-first Focus. */
  homeView: HomeViewId;
  /** Amount of information shown for each story. */
  storyRepresentation: StoryRepresentationId;
  /** Whether Reader headlines open in Coeus or at the publisher's site. */
  articlePreviewMode: ArticlePreviewMode;
  font: FontId;
  palette: PaletteId;
  density: DensityId;
  /** Weighted interests used only by the opt-in Ranked view. */
  keywordRules: KeywordRule[];
  /** Per-source affinity where 1 is neutral, 0.5 deprioritizes, and 1.5 favors. */
  sourceWeights: Record<string, number>;
  /** Private, browser-local 1–5 ratings used by Sources. */
  sourceRatings: Record<string, number>;
}

export interface PrefsStore {
  load(): Promise<UserPrefs>;
  save(prefs: UserPrefs): Promise<void>;
}
