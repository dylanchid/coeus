import type { SourceDef } from "./types";

type SourceInput = Omit<
  SourceDef,
  "language" | "region" | "sourceType" | "cadence" | "depth" | "defaultRank"
> &
  Partial<
    Pick<
      SourceDef,
      "language" | "region" | "sourceType" | "cadence" | "depth" | "defaultRank"
    >
  >;

function source(input: SourceInput): SourceDef {
  return {
    language: "English",
    region: "Global",
    sourceType: "publisher",
    cadence: "daily",
    depth: "mixed",
    defaultRank: 50,
    ...input,
  };
}

/**
 * The full built-in directory. Presence here means Bareaga knows how to read a
 * source; it does not mean that source is enabled for a user.
 */
export const SOURCE_CATALOG: SourceDef[] = [
  source({ id: "hn", name: "Hacker News", homeUrl: "https://news.ycombinator.com", feedUrl: "https://hnrss.org/frontpage", description: "Community-ranked technology and startup links.", topic: "tech", topics: ["programming", "startups", "AI"], tags: ["community", "technical", "breaking"], sourceType: "community", cadence: "live", depth: "brief", defaultRank: 1 }),
  source({ id: "verge", name: "The Verge", homeUrl: "https://www.theverge.com", feedUrl: "https://www.theverge.com/rss/index.xml", description: "Technology, science, entertainment, and digital culture.", topic: "tech", topics: ["hardware", "internet culture", "AI"], tags: ["mainstream", "breaking"], cadence: "live", defaultRank: 8 }),
  source({ id: "arstechnica", name: "Ars Technica", homeUrl: "https://arstechnica.com", feedUrl: "https://feeds.arstechnica.com/arstechnica/index", description: "Deep reporting on technology, science, policy, and computing.", topic: "tech", topics: ["programming", "security", "science"], tags: ["technical", "analysis", "longform"], depth: "deep", defaultRank: 2 }),
  source({ id: "register", name: "The Register", homeUrl: "https://www.theregister.com", feedUrl: "https://www.theregister.com/headlines.atom", description: "Enterprise technology, infrastructure, security, and hardware.", topic: "tech", topics: ["security", "hardware", "programming"], tags: ["technical", "breaking"], cadence: "live", defaultRank: 13 }),
  source({ id: "phoronix", name: "Phoronix", homeUrl: "https://www.phoronix.com", feedUrl: "https://www.phoronix.com/rss.php", description: "Linux hardware benchmarks and open-source engineering news.", topic: "tech", topics: ["open source", "hardware", "programming"], tags: ["independent", "technical", "primary-source"], defaultRank: 15 }),
  source({ id: "wired", name: "Wired", homeUrl: "https://www.wired.com", feedUrl: "https://www.wired.com/feed/rss", description: "Technology, business, science, security, and culture reporting.", topic: "tech", topics: ["AI", "security", "internet culture"], tags: ["mainstream", "analysis", "longform"], depth: "deep", defaultRank: 10 }),
  source({ id: "slashdot", name: "Slashdot", homeUrl: "https://slashdot.org", feedUrl: "https://rss.slashdot.org/Slashdot/slashdotMain", description: "Community discussion of technology and open-source news.", topic: "tech", topics: ["open source", "programming", "hardware"], tags: ["community", "technical"], sourceType: "community", defaultRank: 32 }),
  source({ id: "engadget", name: "Engadget", homeUrl: "https://www.engadget.com", feedUrl: "https://www.engadget.com/rss.xml", description: "Consumer technology, devices, gaming, and product news.", topic: "tech", topics: ["hardware", "internet culture"], tags: ["mainstream", "breaking"], cadence: "live", depth: "brief", defaultRank: 22 }),
  source({ id: "daringfireball", name: "Daring Fireball", homeUrl: "https://daringfireball.net", feedUrl: "https://daringfireball.net/feeds/main", description: "Independent commentary on Apple, design, and the web.", topic: "tech", topics: ["hardware", "internet culture"], tags: ["independent", "analysis"], depth: "deep", defaultRank: 16 }),
  source({ id: "lwn", name: "Linux Weekly News", homeUrl: "https://lwn.net", feedUrl: "https://lwn.net/headlines/rss", description: "Authoritative reporting on the Linux kernel and open source.", topic: "tech", topics: ["open source", "programming", "security"], tags: ["independent", "technical", "longform"], cadence: "weekly", depth: "deep", defaultRank: 11 }),
  source({ id: "bleepingcomputer", name: "BleepingComputer", homeUrl: "https://www.bleepingcomputer.com", feedUrl: "https://www.bleepingcomputer.com/feed/", description: "Practical cybersecurity incidents, threats, and fixes.", topic: "tech", topics: ["security"], tags: ["independent", "technical", "breaking"], cadence: "live", defaultRank: 12 }),
  source({ id: "hackaday", name: "Hackaday", homeUrl: "https://hackaday.com", feedUrl: "https://hackaday.com/blog/feed/", description: "Hardware projects, reverse engineering, and maker culture.", topic: "tech", topics: ["hardware", "open source", "programming"], tags: ["independent", "technical"], defaultRank: 20 }),
  source({ id: "servethehome", name: "ServeTheHome", homeUrl: "https://www.servethehome.com", feedUrl: "https://www.servethehome.com/feed/", description: "Servers, networking, storage, and data-center hardware.", topic: "tech", topics: ["hardware", "open source"], tags: ["independent", "technical", "analysis"], depth: "deep", defaultRank: 28 }),
  source({ id: "techcrunch", name: "TechCrunch", homeUrl: "https://techcrunch.com", feedUrl: "https://techcrunch.com/feed/", description: "Startup financing, products, and the technology industry.", topic: "tech", topics: ["startups", "AI", "business"], tags: ["mainstream", "breaking"], cadence: "live", defaultRank: 14 }),
  source({ id: "404media", name: "404 Media", homeUrl: "https://www.404media.co", feedUrl: "https://www.404media.co/rss/", description: "Independent investigations into technology and the internet.", topic: "tech", topics: ["security", "internet culture", "policy"], tags: ["independent", "analysis", "longform"], depth: "deep", defaultRank: 9 }),
  source({ id: "krebsonsecurity", name: "Krebs on Security", homeUrl: "https://krebsonsecurity.com", feedUrl: "https://krebsonsecurity.com/feed/", description: "Independent investigations of cybercrime and digital security.", topic: "tech", topics: ["security"], tags: ["independent", "technical", "longform"], depth: "deep", defaultRank: 7 }),
  source({ id: "githubblog", name: "GitHub Blog", homeUrl: "https://github.blog", feedUrl: "https://github.blog/feed/", description: "Engineering, open source, security, and product updates from GitHub.", topic: "tech", topics: ["open source", "programming", "security"], tags: ["primary-source", "technical"], sourceType: "primary-source", defaultRank: 24 }),
  source({ id: "cloudflareblog", name: "Cloudflare Blog", homeUrl: "https://blog.cloudflare.com", feedUrl: "https://blog.cloudflare.com/rss/", description: "Primary-source writing on internet infrastructure and security.", topic: "tech", topics: ["security", "programming", "open source"], tags: ["primary-source", "technical", "analysis"], sourceType: "primary-source", depth: "deep", defaultRank: 17 }),
  source({ id: "mittechreview", name: "MIT Technology Review", homeUrl: "https://www.technologyreview.com", feedUrl: "https://www.technologyreview.com/feed/", description: "Analysis of emerging technology and its social consequences.", topic: "tech", topics: ["AI", "science", "policy"], tags: ["analysis", "longform", "research"], depth: "deep", defaultRank: 5 }),
  source({ id: "spectrum", name: "IEEE Spectrum", homeUrl: "https://spectrum.ieee.org", feedUrl: "https://spectrum.ieee.org/feeds/feed.rss", description: "Engineering, robotics, computing, and applied science.", topic: "tech", topics: ["hardware", "AI", "science"], tags: ["technical", "analysis"], sourceType: "research", depth: "deep", defaultRank: 18 }),

  source({ id: "bbc", name: "BBC News", homeUrl: "https://www.bbc.com/news", feedUrl: "https://feeds.bbci.co.uk/news/rss.xml", description: "Global breaking news and public-service reporting.", topic: "news", topics: ["world", "politics", "conflict"], tags: ["mainstream", "breaking"], region: "United Kingdom", cadence: "live", defaultRank: 4 }),
  source({ id: "npr", name: "NPR", homeUrl: "https://www.npr.org", feedUrl: "https://feeds.npr.org/1001/rss.xml", description: "US public-radio reporting on news, policy, and culture.", topic: "news", topics: ["US", "politics", "culture"], tags: ["mainstream", "analysis"], region: "United States", cadence: "live", defaultRank: 6 }),
  source({ id: "guardian", name: "The Guardian", homeUrl: "https://www.theguardian.com", feedUrl: "https://www.theguardian.com/world/rss", description: "International reporting, opinion, culture, and climate coverage.", topic: "news", topics: ["world", "politics", "climate"], tags: ["mainstream", "analysis", "longform"], region: "United Kingdom", cadence: "live", defaultRank: 3 }),
  source({ id: "aljazeera", name: "Al Jazeera", homeUrl: "https://www.aljazeera.com", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml", description: "International news with extensive Middle East coverage.", topic: "news", topics: ["world", "conflict", "politics"], tags: ["mainstream", "breaking"], region: "Middle East", cadence: "live", defaultRank: 19 }),
  source({ id: "ap", name: "Associated Press", homeUrl: "https://apnews.com", feedUrl: "https://apnews.com/index.rss", description: "Global wire reporting focused on verified breaking news.", topic: "news", topics: ["world", "US", "politics"], tags: ["mainstream", "breaking", "low-noise"], cadence: "live", depth: "brief", defaultRank: 2 }),
  source({ id: "propublica", name: "ProPublica", homeUrl: "https://www.propublica.org", feedUrl: "https://feeds.propublica.org/propublica/main", description: "Nonprofit investigative journalism in the public interest.", topic: "news", topics: ["US", "policy", "politics"], tags: ["independent", "analysis", "longform"], region: "United States", depth: "deep", defaultRank: 5 }),
  source({ id: "theconversation", name: "The Conversation", homeUrl: "https://theconversation.com/us", feedUrl: "https://theconversation.com/us/articles.atom", description: "Research-informed analysis written with academic experts.", topic: "news", topics: ["policy", "science", "education"], tags: ["analysis", "research", "longform"], sourceType: "research", depth: "deep", defaultRank: 21 }),
  source({ id: "calmatters", name: "CalMatters", homeUrl: "https://calmatters.org", feedUrl: "https://calmatters.org/feed/", description: "Nonprofit reporting on California politics and policy.", topic: "news", topics: ["local", "policy", "politics"], tags: ["independent", "local", "analysis"], region: "California", defaultRank: 23 }),
  source({ id: "missionlocal", name: "Mission Local", homeUrl: "https://missionlocal.org", feedUrl: "https://missionlocal.org/feed/", description: "Independent neighborhood reporting from San Francisco.", topic: "news", topics: ["local", "policy"], tags: ["independent", "local"], region: "San Francisco", defaultRank: 27 }),
  source({ id: "kqed", name: "KQED", homeUrl: "https://www.kqed.org/news", feedUrl: "https://www.kqed.org/news/feed", description: "Bay Area public-media news, arts, science, and culture.", topic: "news", topics: ["local", "culture", "science"], tags: ["local", "mainstream"], region: "Bay Area", defaultRank: 25 }),
  source({ id: "scotusblog", name: "SCOTUSblog", homeUrl: "https://www.scotusblog.com", feedUrl: "https://www.scotusblog.com/feed/", description: "Specialist coverage and analysis of the US Supreme Court.", topic: "news", topics: ["courts", "policy", "US"], tags: ["independent", "analysis", "primary-source"], region: "United States", depth: "deep", defaultRank: 26 }),

  source({ id: "cnbc", name: "CNBC", homeUrl: "https://www.cnbc.com", feedUrl: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", description: "Markets, companies, investing, and global business news.", topic: "business", topics: ["markets", "business", "energy"], tags: ["mainstream", "breaking"], cadence: "live", defaultRank: 18 }),
  source({ id: "fortune", name: "Fortune", homeUrl: "https://fortune.com", feedUrl: "https://fortune.com/feed/", description: "Companies, leadership, markets, and the global economy.", topic: "business", topics: ["business", "markets", "labor"], tags: ["mainstream", "analysis"], defaultRank: 31 }),
  source({ id: "marketplace", name: "Marketplace", homeUrl: "https://www.marketplace.org", feedUrl: "https://www.marketplace.org/feed/podcast/marketplace/", description: "Accessible reporting on the economy, labor, and markets.", topic: "business", topics: ["labor", "markets", "policy"], tags: ["analysis", "mainstream"], region: "United States", defaultRank: 20 }),
  source({ id: "restofworld", name: "Rest of World", homeUrl: "https://restofworld.org", feedUrl: "https://restofworld.org/feed/latest/", description: "Technology and business reporting beyond Western markets.", topic: "business", topics: ["world", "startups", "labor"], tags: ["independent", "analysis", "longform"], depth: "deep", defaultRank: 12 }),
  source({ id: "canarymedia", name: "Canary Media", homeUrl: "https://www.canarymedia.com", feedUrl: "https://www.canarymedia.com/rss.xml", description: "Independent reporting on the clean-energy transition.", topic: "business", topics: ["energy", "climate", "policy"], tags: ["independent", "technical", "analysis"], depth: "deep", defaultRank: 15 }),
  source({ id: "stratechery", name: "Stratechery", homeUrl: "https://stratechery.com", feedUrl: "https://stratechery.com/feed/", description: "Strategy and business analysis of technology platforms.", topic: "business", topics: ["business", "startups", "AI"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 9 }),

  source({ id: "scientificamerican", name: "Scientific American", homeUrl: "https://www.scientificamerican.com", feedUrl: "https://www.scientificamerican.com/platform/syndication/rss/", description: "Science reporting and expert analysis across disciplines.", topic: "science", topics: ["biology", "physics", "climate"], tags: ["mainstream", "analysis", "longform"], depth: "deep", defaultRank: 10 }),
  source({ id: "phys", name: "Phys.org", homeUrl: "https://phys.org", feedUrl: "https://phys.org/rss-feed/", description: "High-volume research news across physics, biology, and space.", topic: "science", topics: ["physics", "biology", "space"], tags: ["research", "breaking"], sourceType: "research", cadence: "live", depth: "brief", defaultRank: 29 }),
  source({ id: "sciencedaily", name: "ScienceDaily", homeUrl: "https://www.sciencedaily.com", feedUrl: "https://www.sciencedaily.com/rss/all.xml", description: "Frequent summaries of newly published scientific research.", topic: "science", topics: ["medicine", "biology", "climate"], tags: ["research", "breaking"], sourceType: "research", cadence: "live", depth: "brief", defaultRank: 34 }),
  source({ id: "nasa", name: "NASA", homeUrl: "https://www.nasa.gov", feedUrl: "https://www.nasa.gov/feed/", description: "Missions, discoveries, and agency updates direct from NASA.", topic: "science", topics: ["space", "climate"], tags: ["primary-source", "research"], sourceType: "primary-source", defaultRank: 3 }),
  source({ id: "nature", name: "Nature News", homeUrl: "https://www.nature.com/news", feedUrl: "https://www.nature.com/nature.rss", description: "Research, news, and commentary from the scientific journal Nature.", topic: "science", topics: ["biology", "medicine", "physics"], tags: ["research", "primary-source", "analysis"], sourceType: "research", depth: "deep", defaultRank: 1 }),
  source({ id: "stat", name: "STAT", homeUrl: "https://www.statnews.com", feedUrl: "https://www.statnews.com/feed/", description: "Health, medicine, biotechnology, and life-science reporting.", topic: "science", topics: ["medicine", "biology", "business"], tags: ["technical", "analysis", "breaking"], depth: "deep", defaultRank: 8 }),
  source({ id: "quanta", name: "Quanta Magazine", homeUrl: "https://www.quantamagazine.org", feedUrl: "https://www.quantamagazine.org/feed/", description: "Deep explanatory journalism in mathematics and basic science.", topic: "science", topics: ["physics", "biology", "systems"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 2 }),
  source({ id: "noaa", name: "NOAA", homeUrl: "https://www.noaa.gov", feedUrl: "https://www.noaa.gov/rss.xml", description: "Weather, oceans, climate, and research updates from NOAA.", topic: "science", topics: ["climate", "primary sources"], tags: ["primary-source", "research"], region: "United States", sourceType: "primary-source", defaultRank: 14 }),

  source({ id: "lithub", name: "Literary Hub", homeUrl: "https://lithub.com", feedUrl: "https://lithub.com/feed/", description: "Books, criticism, literary culture, and author conversations.", topic: "news", topics: ["books", "culture"], tags: ["independent", "analysis", "longform"], depth: "deep", defaultRank: 36 }),
  source({ id: "hyperallergic", name: "Hyperallergic", homeUrl: "https://hyperallergic.com", feedUrl: "https://hyperallergic.com/feed/", description: "Independent reporting and criticism on art and culture.", topic: "news", topics: ["art", "culture", "policy"], tags: ["independent", "analysis"], depth: "deep", defaultRank: 33 }),
  source({ id: "pitchfork", name: "Pitchfork", homeUrl: "https://pitchfork.com", feedUrl: "https://pitchfork.com/rss/news/", description: "Music news, criticism, features, and reviews.", topic: "news", topics: ["music", "culture"], tags: ["mainstream", "analysis"], defaultRank: 40 }),
  source({ id: "aeon", name: "Aeon", homeUrl: "https://aeon.co", feedUrl: "https://aeon.co/feed.rss", description: "Long essays on philosophy, science, psychology, and society.", topic: "news", topics: ["philosophy", "ideas", "education"], tags: ["independent", "analysis", "longform", "low-noise"], cadence: "weekly", depth: "deep", defaultRank: 7 }),
  source({ id: "publicdomainreview", name: "The Public Domain Review", homeUrl: "https://publicdomainreview.org", feedUrl: "https://publicdomainreview.org/rss.xml", description: "Curated essays and collections from cultural history.", topic: "news", topics: ["art", "books", "ideas"], tags: ["independent", "longform", "low-noise"], cadence: "weekly", depth: "deep", defaultRank: 30 }),
  source({ id: "longreads", name: "Longreads", homeUrl: "https://longreads.com", feedUrl: "https://longreads.com/feed/", description: "Curated and original longform journalism and essays.", topic: "news", topics: ["ideas", "culture", "world"], tags: ["independent", "longform", "analysis"], cadence: "weekly", depth: "deep", defaultRank: 6 }),
];

/** The original starter set remains the default for new and existing users. */
export const DEFAULT_ENABLED_SOURCE_IDS = [
  "hn", "verge", "arstechnica", "register", "phoronix", "wired", "slashdot",
  "engadget", "daringfireball", "lwn", "bleepingcomputer", "hackaday",
  "servethehome", "bbc", "npr", "guardian", "aljazeera", "cnbc", "fortune",
  "scientificamerican", "phys", "sciencedaily",
] as const;

/** Backward-compatible name for the starter definitions. */
export const DEFAULT_SOURCES = SOURCE_CATALOG.filter((item) =>
  DEFAULT_ENABLED_SOURCE_IDS.includes(item.id as (typeof DEFAULT_ENABLED_SOURCE_IDS)[number])
);

export const TOPICS = ["all", "tech", "news", "business", "science"] as const;
export type Topic = (typeof TOPICS)[number];

export function sourcesByTopic(topic: Topic): SourceDef[] {
  return sourcesByTopicWithCustom(topic);
}

/** Merge persisted user sources without allowing them to shadow built-ins. */
export function allSources(customSources: readonly SourceDef[] = []): SourceDef[] {
  const builtInIds = new Set(SOURCE_CATALOG.map((item) => item.id));
  const custom = customSources.filter(
    (item, index, list) =>
      !builtInIds.has(item.id) && list.findIndex((candidate) => candidate.id === item.id) === index
  );
  return [...SOURCE_CATALOG, ...custom];
}

export function sourcesByTopicWithCustom(
  topic: Topic,
  customSources: readonly SourceDef[] = []
): SourceDef[] {
  const sources = allSources(customSources);
  return topic === "all" ? sources : sources.filter((item) => item.topic === topic);
}

export function defaultSourceOrder(): string[] {
  return [...DEFAULT_ENABLED_SOURCE_IDS];
}

export function catalogSourceIds(): string[] {
  return SOURCE_CATALOG.map((item) => item.id);
}

/** Sanitize an explicitly stored enabled set; null means no set was stored. */
export function storedSourceOrder(
  value: unknown,
  customSources: readonly SourceDef[] = []
): string[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set(allSources(customSources).map((item) => item.id));
  return [...new Set(value.filter((id): id is string => typeof id === "string" && known.has(id)))];
}

export function sourceByIdMap(customSources: readonly SourceDef[] = []) {
  return new Map(allSources(customSources).map((item) => [item.id, item]));
}

export function getSource(id: string, customSources: readonly SourceDef[] = []): SourceDef | undefined {
  return sourceByIdMap(customSources).get(id);
}

export function sourceTopic(id: string, customSources: readonly SourceDef[] = []): string | undefined {
  return sourceByIdMap(customSources).get(id)?.topic;
}

/** Order list items by id sequence; append any leftovers. */
/** Turn a display name into a short, URL/id-safe slug; never empty. */
export function slugifyId(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug.slice(0, 60) || "custom-source";
}

/** Sanitize user-supplied custom sources; used for both prefs load and server-side revalidation. */
export function sanitizeCustomSources(value: unknown): SourceDef[] {
  if (!Array.isArray(value)) return [];
  const builtInIds = new Set(catalogSourceIds());
  const seen = new Set<string>();
  return value.flatMap((candidate): SourceDef[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<SourceDef>;
    const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 80) : "";
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
    const feedUrl = typeof raw.feedUrl === "string" ? raw.feedUrl.trim() : "";
    const homeUrl = typeof raw.homeUrl === "string" ? raw.homeUrl.trim() : feedUrl;
    if (!id || !name || !feedUrl || builtInIds.has(id) || seen.has(id)) return [];
    try {
      if (new URL(feedUrl).protocol !== "https:") return [];
      if (new URL(homeUrl).protocol !== "https:") return [];
    } catch {
      return [];
    }
    seen.add(id);
    return [{
      id, name, feedUrl, homeUrl,
      topic: typeof raw.topic === "string" && raw.topic ? raw.topic : "all",
      topics: Array.isArray(raw.topics) ? raw.topics.filter((v): v is string => typeof v === "string").slice(0, 20) : [],
      tags: Array.isArray(raw.tags) ? raw.tags.filter((v): v is string => typeof v === "string").slice(0, 20) : ["custom"],
      description: typeof raw.description === "string" ? raw.description : "User-added feed",
      language: typeof raw.language === "string" ? raw.language : "Unknown",
      region: typeof raw.region === "string" ? raw.region : "Global",
      sourceType: raw.sourceType === "community" || raw.sourceType === "primary-source" || raw.sourceType === "research" ? raw.sourceType : "publisher",
      cadence: raw.cadence === "live" || raw.cadence === "weekly" ? raw.cadence : "daily",
      depth: raw.depth === "brief" || raw.depth === "deep" ? raw.depth : "mixed",
      defaultRank: Number.isFinite(Number(raw.defaultRank)) ? Number(raw.defaultRank) : 50,
    }];
  }).slice(0, 100);
}

export function orderByIds<T extends { id: string }>(list: T[], order: string[]): T[] {
  const byId = new Map(list.map((item) => [item.id, item]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      seen.add(id);
    }
  }
  for (const item of list) {
    if (!seen.has(item.id)) ordered.push(item);
  }
  return ordered;
}
