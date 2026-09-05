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

  // Culture, letters, and ideas
  source({ id: "lithub", name: "Literary Hub", homeUrl: "https://lithub.com", feedUrl: "https://lithub.com/feed/", description: "Books, criticism, literary culture, and author conversations.", topic: "culture", topics: ["books", "literature", "culture"], tags: ["independent", "analysis", "longform"], depth: "deep", defaultRank: 4 }),
  source({ id: "aeon", name: "Aeon", homeUrl: "https://aeon.co", feedUrl: "https://aeon.co/feed.rss", description: "Long essays on philosophy, science, psychology, and society.", topic: "culture", topics: ["philosophy", "ideas", "essays"], tags: ["independent", "analysis", "longform", "low-noise"], cadence: "weekly", depth: "deep", defaultRank: 1 }),
  source({ id: "longreads", name: "Longreads", homeUrl: "https://longreads.com", feedUrl: "https://longreads.com/feed/", description: "Curated and original longform journalism and essays.", topic: "culture", topics: ["essays", "culture", "world"], tags: ["independent", "longform", "analysis"], cadence: "weekly", depth: "deep", defaultRank: 5 }),
  source({ id: "openculture", name: "Open Culture", homeUrl: "https://www.openculture.com", feedUrl: "https://www.openculture.com/feed", description: "Open courses, books, films, art, and cultural archives.", topic: "culture", topics: ["culture", "education", "archives"], tags: ["independent", "curated", "open-access"], depth: "deep", defaultRank: 7 }),
  source({ id: "marginalian", name: "The Marginalian", homeUrl: "https://www.themarginalian.org", feedUrl: "https://www.themarginalian.org/feed/", description: "Reflective essays connecting books, art, science, and philosophy.", topic: "culture", topics: ["books", "ideas", "philosophy"], tags: ["independent", "essays", "longform", "low-noise"], cadence: "weekly", depth: "deep", defaultRank: 2 }),
  source({ id: "publicbooks", name: "Public Books", homeUrl: "https://www.publicbooks.org", feedUrl: "https://www.publicbooks.org/feed/", description: "Ideas, books, and culture written for a broad public.", topic: "culture", topics: ["books", "ideas", "criticism"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 8 }),
  source({ id: "parisreview", name: "The Paris Review", homeUrl: "https://www.theparisreview.org", feedUrl: "https://www.theparisreview.org/blog/feed/", description: "Literary interviews, fiction, poetry, and cultural essays.", topic: "culture", topics: ["literature", "books", "poetry"], tags: ["independent", "longform"], cadence: "weekly", depth: "deep", defaultRank: 6 }),
  source({ id: "nplusone", name: "n+1", homeUrl: "https://www.nplusonemag.com", feedUrl: "https://www.nplusonemag.com/feed/", description: "Literature, politics, criticism, and contemporary intellectual life.", topic: "culture", topics: ["ideas", "literature", "criticism"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 11 }),
  source({ id: "electricliterature", name: "Electric Literature", homeUrl: "https://electricliterature.com", feedUrl: "https://electricliterature.com/feed/", description: "Literary culture, reading lists, essays, and emerging writers.", topic: "culture", topics: ["literature", "books", "culture"], tags: ["independent", "analysis"], defaultRank: 14 }),
  source({ id: "wordswithoutborders", name: "Words Without Borders", homeUrl: "https://wordswithoutborders.org", feedUrl: "https://wordswithoutborders.org/feed/", description: "International literature in translation and writing about translation.", topic: "culture", topics: ["literature", "world", "translation"], tags: ["independent", "global", "nonprofit"], cadence: "weekly", depth: "deep", defaultRank: 9 }),
  source({ id: "smithsonianmag", name: "Smithsonian Magazine", homeUrl: "https://www.smithsonianmag.com", feedUrl: "https://www.smithsonianmag.com/rss/latest_articles/", description: "Accessible stories spanning culture, history, science, and travel.", topic: "culture", topics: ["culture", "history", "museums"], tags: ["mainstream", "educational", "analysis"], region: "United States", defaultRank: 10 }),
  source({ id: "atlasobscura", name: "Atlas Obscura", homeUrl: "https://www.atlasobscura.com", feedUrl: "https://www.atlasobscura.com/feeds/latest", description: "Unexpected places, material culture, foodways, and local histories.", topic: "culture", topics: ["places", "history", "culture"], tags: ["independent", "curated", "global"], defaultRank: 15 }),
  source({ id: "nprarts", name: "NPR Arts & Life", homeUrl: "https://www.npr.org/sections/arts/", feedUrl: "https://feeds.npr.org/1008/rss.xml", description: "Public-radio coverage of books, film, television, art, and culture.", topic: "culture", topics: ["culture", "books", "film"], tags: ["mainstream", "public-media"], region: "United States", defaultRank: 12 }),
  source({ id: "thepoint", name: "The Point", homeUrl: "https://thepointmag.com", feedUrl: "https://thepointmag.com/feed/", description: "Philosophical essays about contemporary life and culture.", topic: "culture", topics: ["ideas", "philosophy", "essays"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 17 }),
  source({ id: "bookriot", name: "Book Riot", homeUrl: "https://bookriot.com", feedUrl: "https://bookriot.com/feed/", description: "Book news, recommendations, criticism, and reading culture.", topic: "culture", topics: ["books", "literature", "culture"], tags: ["independent", "accessible"], defaultRank: 23 }),
  source({ id: "chireviewbooks", name: "Chicago Review of Books", homeUrl: "https://chireviewofbooks.com", feedUrl: "https://chireviewofbooks.com/feed/", description: "Independent reviews, interviews, and essays about new books.", topic: "culture", topics: ["books", "literature", "criticism"], tags: ["independent", "analysis"], cadence: "weekly", depth: "deep", defaultRank: 19 }),
  source({ id: "fullstop", name: "Full Stop", homeUrl: "https://www.full-stop.net", feedUrl: "https://www.full-stop.net/feed/", description: "Literary criticism focused on independent and international writing.", topic: "culture", topics: ["books", "literature", "criticism"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 21 }),
  source({ id: "asianreviewbooks", name: "Asian Review of Books", homeUrl: "https://asianreviewofbooks.com/content", feedUrl: "https://asianreviewofbooks.com/content/feed/", description: "Reviews and essays on books from and about Asia.", topic: "culture", topics: ["books", "world", "criticism"], tags: ["independent", "global", "analysis"], region: "Asia", cadence: "weekly", depth: "deep", defaultRank: 20 }),
  source({ id: "africasacountry", name: "Africa Is a Country", homeUrl: "https://africasacountry.com", feedUrl: "https://africasacountry.com/feed", description: "Writing on African politics, media, history, and cultural life.", topic: "culture", topics: ["culture", "world", "ideas"], tags: ["independent", "global", "analysis"], region: "Africa", depth: "deep", defaultRank: 13 }),
  source({ id: "guernica", name: "Guernica", homeUrl: "https://www.guernicamag.com", feedUrl: "https://www.guernicamag.com/feed/", description: "Essays, fiction, poetry, and interviews at the intersection of art and politics.", topic: "culture", topics: ["literature", "ideas", "poetry"], tags: ["independent", "longform", "nonprofit"], cadence: "weekly", depth: "deep", defaultRank: 16 }),
  source({ id: "granta", name: "Granta", homeUrl: "https://granta.com", feedUrl: "https://granta.com/feed/", description: "New fiction, memoir, reportage, poetry, and literary criticism.", topic: "culture", topics: ["literature", "essays", "poetry"], tags: ["independent", "longform"], cadence: "weekly", depth: "deep", defaultRank: 18 }),
  source({ id: "ploughshares", name: "Ploughshares", homeUrl: "https://pshares.org", feedUrl: "https://pshares.org/feed/", description: "Literary essays, interviews, fiction, and poetry from a long-running journal.", topic: "culture", topics: ["literature", "poetry", "books"], tags: ["independent", "longform"], cadence: "weekly", depth: "deep", defaultRank: 22 }),

  // Visual art, design, architecture, performance, film, and music
  source({ id: "hyperallergic", name: "Hyperallergic", homeUrl: "https://hyperallergic.com", feedUrl: "https://hyperallergic.com/feed/", description: "Independent reporting and criticism on art and culture.", topic: "arts", topics: ["art", "museums", "policy"], tags: ["independent", "analysis"], depth: "deep", defaultRank: 1 }),
  source({ id: "pitchfork", name: "Pitchfork", homeUrl: "https://pitchfork.com", feedUrl: "https://pitchfork.com/rss/news/", description: "Music news, criticism, features, and reviews.", topic: "arts", topics: ["music", "culture", "criticism"], tags: ["mainstream", "analysis"], defaultRank: 15 }),
  source({ id: "artnews", name: "ARTnews", homeUrl: "https://www.artnews.com", feedUrl: "https://www.artnews.com/c/art-news/news/feed/", description: "International visual-art news, museums, markets, and exhibitions.", topic: "arts", topics: ["art", "museums", "markets"], tags: ["mainstream", "breaking"], cadence: "live", defaultRank: 8 }),
  source({ id: "artforum", name: "Artforum", homeUrl: "https://www.artforum.com", feedUrl: "https://www.artforum.com/feed/", description: "Contemporary-art criticism, reviews, interviews, and news.", topic: "arts", topics: ["art", "criticism", "exhibitions"], tags: ["analysis", "longform"], depth: "deep", defaultRank: 3 }),
  source({ id: "artnewspaper", name: "The Art Newspaper", homeUrl: "https://www.theartnewspaper.com", feedUrl: "https://www.theartnewspaper.com/rss.xml", description: "Global reporting on museums, exhibitions, heritage, and the art trade.", topic: "arts", topics: ["art", "museums", "heritage"], tags: ["mainstream", "breaking", "analysis"], cadence: "live", defaultRank: 4 }),
  source({ id: "colossal", name: "Colossal", homeUrl: "https://www.thisiscolossal.com", feedUrl: "https://www.thisiscolossal.com/feed/", description: "Contemporary art, craft, photography, and visual culture.", topic: "arts", topics: ["art", "photography", "design"], tags: ["independent", "visual"], defaultRank: 6 }),
  source({ id: "creativeboom", name: "Creative Boom", homeUrl: "https://www.creativeboom.com", feedUrl: "https://www.creativeboom.com/feed/", description: "Art, illustration, graphic design, photography, and creative practice.", topic: "arts", topics: ["design", "art", "photography"], tags: ["independent", "visual"], defaultRank: 18 }),
  source({ id: "dezeen", name: "Dezeen", homeUrl: "https://www.dezeen.com", feedUrl: "https://www.dezeen.com/feed/", description: "International architecture, interiors, and design news.", topic: "arts", topics: ["architecture", "design", "places"], tags: ["mainstream", "visual", "breaking"], cadence: "live", defaultRank: 10 }),
  source({ id: "archdaily", name: "ArchDaily", homeUrl: "https://www.archdaily.com", feedUrl: "https://www.archdaily.com/feed", description: "Architecture projects, urbanism, materials, and professional practice.", topic: "arts", topics: ["architecture", "design", "cities"], tags: ["mainstream", "technical", "visual"], cadence: "live", defaultRank: 13 }),
  source({ id: "cooperhewitt", name: "Cooper Hewitt", homeUrl: "https://www.cooperhewitt.org", feedUrl: "https://www.cooperhewitt.org/feed/", description: "Research and stories from the Smithsonian Design Museum.", topic: "arts", topics: ["design", "museums", "history"], tags: ["primary-source", "educational"], region: "United States", sourceType: "primary-source", cadence: "weekly", depth: "deep", defaultRank: 9 }),
  source({ id: "filmcomment", name: "Film Comment", homeUrl: "https://www.filmcomment.com", feedUrl: "https://www.filmcomment.com/feed/", description: "Film criticism, festival coverage, interviews, and cinematic history.", topic: "arts", topics: ["film", "criticism", "history"], tags: ["independent", "analysis", "longform"], cadence: "weekly", depth: "deep", defaultRank: 5 }),
  source({ id: "rogerebert", name: "RogerEbert.com", homeUrl: "https://www.rogerebert.com", feedUrl: "https://www.rogerebert.com/feed", description: "Film reviews, interviews, features, and criticism.", topic: "arts", topics: ["film", "criticism", "culture"], tags: ["independent", "analysis"], defaultRank: 16 }),
  source({ id: "nprmusic", name: "NPR Music", homeUrl: "https://www.npr.org/music/", feedUrl: "https://feeds.npr.org/1039/rss.xml", description: "Music discovery, interviews, criticism, performances, and news.", topic: "arts", topics: ["music", "criticism", "culture"], tags: ["mainstream", "public-media"], region: "United States", defaultRank: 7 }),
  source({ id: "bandcampdaily", name: "Bandcamp Daily", homeUrl: "https://daily.bandcamp.com", feedUrl: "https://daily.bandcamp.com/feed", description: "Artist-focused music discovery across scenes, genres, and regions.", topic: "arts", topics: ["music", "world", "culture"], tags: ["independent", "global", "curated"], defaultRank: 11 }),
  source({ id: "aperture", name: "Aperture", homeUrl: "https://aperture.org", feedUrl: "https://aperture.org/feed/", description: "Photography, photobooks, exhibitions, and visual-culture criticism.", topic: "arts", topics: ["photography", "art", "books"], tags: ["independent", "analysis", "visual"], cadence: "weekly", depth: "deep", defaultRank: 12 }),
  source({ id: "culturetype", name: "Culture Type", homeUrl: "https://www.culturetype.com", feedUrl: "https://www.culturetype.com/feed/", description: "Black visual art, museums, exhibitions, and the cultural record.", topic: "arts", topics: ["art", "museums", "Black history"], tags: ["independent", "analysis", "specialist"], region: "United States", cadence: "weekly", depth: "deep", defaultRank: 14 }),
  source({ id: "artsjournal", name: "ArtsJournal", homeUrl: "https://www.artsjournal.com", feedUrl: "https://www.artsjournal.com/feed/", description: "A broad digest of reporting and debate across the arts.", topic: "arts", topics: ["art", "theater", "music"], tags: ["curated", "breaking"], cadence: "live", depth: "brief", defaultRank: 19 }),
  source({ id: "art21", name: "Art21", homeUrl: "https://art21.org", feedUrl: "https://art21.org/feed/", description: "Artists, processes, teaching, and ideas in contemporary art.", topic: "arts", topics: ["art", "education", "criticism"], tags: ["primary-source", "nonprofit", "longform"], sourceType: "primary-source", cadence: "weekly", depth: "deep", defaultRank: 17 }),
  source({ id: "stereogum", name: "Stereogum", homeUrl: "https://www.stereogum.com", feedUrl: "https://www.stereogum.com/feed/", description: "Independent music news, reviews, features, and premieres.", topic: "arts", topics: ["music", "culture", "criticism"], tags: ["independent", "breaking"], cadence: "live", defaultRank: 22 }),
  source({ id: "quietus", name: "The Quietus", homeUrl: "https://thequietus.com", feedUrl: "https://thequietus.com/feed/", description: "Independent music and culture criticism with an adventurous focus.", topic: "arts", topics: ["music", "criticism", "culture"], tags: ["independent", "analysis", "longform"], depth: "deep", defaultRank: 20 }),
  source({ id: "aquariumdrunkard", name: "Aquarium Drunkard", homeUrl: "https://aquariumdrunkard.com", feedUrl: "https://aquariumdrunkard.com/feed/", description: "Eclectic music criticism, interviews, mixes, and archival discoveries.", topic: "arts", topics: ["music", "archives", "criticism"], tags: ["independent", "curated", "low-noise"], cadence: "weekly", depth: "deep", defaultRank: 21 }),
  source({ id: "slant", name: "Slant Magazine", homeUrl: "https://www.slantmagazine.com", feedUrl: "https://www.slantmagazine.com/feed/", description: "Film, music, television, games, and theater criticism.", topic: "arts", topics: ["film", "music", "criticism"], tags: ["independent", "analysis"], defaultRank: 24 }),
  source({ id: "lwlies", name: "Little White Lies", homeUrl: "https://lwlies.com", feedUrl: "https://lwlies.com/feed/", description: "Independent film journalism, illustration, reviews, and interviews.", topic: "arts", topics: ["film", "criticism", "design"], tags: ["independent", "visual", "analysis"], defaultRank: 23 }),
  source({ id: "sensesofcinema", name: "Senses of Cinema", homeUrl: "https://www.sensesofcinema.com", feedUrl: "https://www.sensesofcinema.com/feed/", description: "International film criticism, festival reports, and director studies.", topic: "arts", topics: ["film", "criticism", "history"], tags: ["independent", "research", "longform"], region: "Australia", cadence: "weekly", depth: "deep", defaultRank: 25 }),
  source({ id: "brightlights", name: "Bright Lights Film Journal", homeUrl: "https://brightlightsfilm.com", feedUrl: "https://brightlightsfilm.com/feed/", description: "Wide-ranging film criticism, history, interviews, and visual essays.", topic: "arts", topics: ["film", "history", "criticism"], tags: ["independent", "longform", "low-noise"], cadence: "weekly", depth: "deep", defaultRank: 28 }),
  source({ id: "americantheatre", name: "American Theatre", homeUrl: "https://www.americantheatre.org", feedUrl: "https://www.americantheatre.org/feed/", description: "News, criticism, and field reporting from the American theater community.", topic: "arts", topics: ["theater", "performance", "culture"], tags: ["independent", "specialist", "analysis"], region: "United States", defaultRank: 26 }),
  source({ id: "dancemagazine", name: "Dance Magazine", homeUrl: "https://www.dancemagazine.com", feedUrl: "https://www.dancemagazine.com/feed/", description: "Dance performance, artists, training, history, and criticism.", topic: "arts", topics: ["dance", "performance", "culture"], tags: ["specialist", "analysis"], region: "United States", defaultRank: 29 }),
  source({ id: "architectsnewspaper", name: "The Architect's Newspaper", homeUrl: "https://www.archpaper.com", feedUrl: "https://www.archpaper.com/feed/", description: "Architecture, urbanism, landscape, preservation, and design news.", topic: "arts", topics: ["architecture", "cities", "design"], tags: ["independent", "technical", "breaking"], defaultRank: 27 }),
  source({ id: "designboom", name: "designboom", homeUrl: "https://www.designboom.com", feedUrl: "https://www.designboom.com/feed/", description: "Global design, architecture, art, and technology projects.", topic: "arts", topics: ["design", "architecture", "art"], tags: ["independent", "global", "visual"], cadence: "live", defaultRank: 30 }),
  source({ id: "printmag", name: "PRINT Magazine", homeUrl: "https://www.printmag.com", feedUrl: "https://www.printmag.com/feed/", description: "Graphic design, typography, illustration, and visual-culture history.", topic: "arts", topics: ["design", "typography", "history"], tags: ["specialist", "visual", "analysis"], defaultRank: 31 }),

  // History, archaeology, archives, and public memory
  source({ id: "publicdomainreview", name: "The Public Domain Review", homeUrl: "https://publicdomainreview.org", feedUrl: "https://publicdomainreview.org/rss.xml", description: "Curated essays and collections from cultural history.", topic: "history", topics: ["archives", "art", "books"], tags: ["independent", "longform", "low-noise", "open-access"], cadence: "weekly", depth: "deep", defaultRank: 1 }),
  source({ id: "jstordaily", name: "JSTOR Daily", homeUrl: "https://daily.jstor.org", feedUrl: "https://daily.jstor.org/feed/", description: "Public-facing stories grounded in scholarship across history and culture.", topic: "history", topics: ["history", "research", "ideas"], tags: ["research", "analysis", "open-access"], sourceType: "research", depth: "deep", defaultRank: 2 }),
  source({ id: "nationalarchives", name: "Pieces of History", homeUrl: "https://prologue.blogs.archives.gov", feedUrl: "https://prologue.blogs.archives.gov/feed/", description: "Documents and stories from the U.S. National Archives.", topic: "history", topics: ["archives", "US", "primary sources"], tags: ["primary-source", "educational"], region: "United States", sourceType: "primary-source", cadence: "weekly", depth: "deep", defaultRank: 4 }),
  source({ id: "internetarchive", name: "Internet Archive Blogs", homeUrl: "https://blog.archive.org", feedUrl: "https://blog.archive.org/feed/", description: "Digital preservation, open collections, library work, and archival access.", topic: "history", topics: ["archives", "internet culture", "libraries"], tags: ["primary-source", "open-access", "nonprofit"], sourceType: "primary-source", cadence: "weekly", defaultRank: 8 }),
  source({ id: "nursingclio", name: "Nursing Clio", homeUrl: "https://nursingclio.org", feedUrl: "https://nursingclio.org/feed/", description: "Accessible histories of medicine, gender, bodies, and reproductive health.", topic: "history", topics: ["history", "medicine", "gender"], tags: ["independent", "research", "analysis"], sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 6 }),
  source({ id: "medievalists", name: "Medievalists.net", homeUrl: "https://www.medievalists.net", feedUrl: "https://www.medievalists.net/feed/", description: "Medieval history, archaeology, books, research, and cultural heritage.", topic: "history", topics: ["medieval", "archaeology", "books"], tags: ["independent", "research", "specialist"], defaultRank: 10 }),
  source({ id: "archaeologymag", name: "Archaeology Magazine", homeUrl: "https://archaeology.org", feedUrl: "https://archaeology.org/feed/", description: "Discoveries, fieldwork, artifacts, and ancient cultures worldwide.", topic: "history", topics: ["archaeology", "ancient history", "heritage"], tags: ["research", "mainstream", "global"], sourceType: "research", defaultRank: 5 }),
  source({ id: "historyworkshop", name: "History Workshop", homeUrl: "https://www.historyworkshop.org.uk", feedUrl: "https://www.historyworkshop.org.uk/feed/", description: "Radical, public, and collaborative histories connecting past and present.", topic: "history", topics: ["history", "public history", "politics"], tags: ["independent", "research", "analysis"], region: "United Kingdom", sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 3 }),
  source({ id: "blackperspectives", name: "Black Perspectives", homeUrl: "https://www.aaihs.org", feedUrl: "https://www.aaihs.org/feed/", description: "Global Black intellectual history from the African American Intellectual History Society.", topic: "history", topics: ["Black history", "ideas", "world"], tags: ["research", "nonprofit", "analysis"], sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 7 }),
  source({ id: "thejunto", name: "The Junto", homeUrl: "https://earlyamericanists.com", feedUrl: "https://earlyamericanists.com/feed/", description: "Group scholarship and commentary on early American history.", topic: "history", topics: ["early America", "US", "research"], tags: ["independent", "research", "analysis"], region: "United States", sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 11 }),
  source({ id: "legalhistoryblog", name: "Legal History Blog", homeUrl: "https://legalhistoryblog.blogspot.com", feedUrl: "https://legalhistoryblog.blogspot.com/feeds/posts/default", description: "Books, scholarship, events, and opportunities in legal history.", topic: "history", topics: ["legal history", "books", "research"], tags: ["research", "specialist", "low-noise"], sourceType: "research", defaultRank: 13 }),
  source({ id: "ouphistory", name: "OUPblog History", homeUrl: "https://blog.oup.com/category/history/", feedUrl: "https://blog.oup.com/category/history/feed/", description: "Historical essays and research from Oxford University Press authors.", topic: "history", topics: ["history", "books", "research"], tags: ["primary-source", "educational", "analysis"], sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 9 }),
  source({ id: "notevenpast", name: "Not Even Past", homeUrl: "https://notevenpast.org", feedUrl: "https://notevenpast.org/feed/", description: "Public history, books, teaching, and digital projects from historians.", topic: "history", topics: ["public history", "books", "education"], tags: ["research", "educational", "open-access"], region: "United States", sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 12 }),
  source({ id: "imperialglobal", name: "Imperial & Global Forum", homeUrl: "https://imperialglobalexeter.com", feedUrl: "https://imperialglobalexeter.com/feed/", description: "Research and debate on empires, global history, and their legacies.", topic: "history", topics: ["global history", "empire", "politics"], tags: ["research", "analysis", "longform"], region: "United Kingdom", sourceType: "research", cadence: "weekly", depth: "deep", defaultRank: 14 }),
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

export const TOPICS = ["all", "tech", "news", "business", "science", "culture", "arts", "history"] as const;
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
