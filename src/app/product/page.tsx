import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Product — Bareaga",
  description:
    "A clear view of what Bareaga does today, how it works, and where the product is going next.",
};

const liveFeatures = [
  {
    number: "01",
    title: "One calm news surface",
    body: "Independent RSS sources become one fast editorial view, with progressive loading and isolated failures built in.",
    note: "22 sources · resilient by design",
  },
  {
    number: "02",
    title: "Find the signal",
    body: "Search every loaded headline and summary, or switch between source groups, balanced coverage, and strict recency.",
    note: "Search · Grid / Top / Focus",
  },
  {
    number: "03",
    title: "Make the desk yours",
    body: "Choose sources, density, type, color, details, and feed window. Every choice stays local and exportable.",
    note: "Transparent controls · local first",
  },
  {
    number: "04",
    title: "Keep what matters",
    body: "Save stories, annotate them, search the archive, and gather durable personal, public, or community collections.",
    note: "Archive · notes · portable collections",
  },
  {
    number: "05",
    title: "Pass the source along",
    body: "Share a specific passage with context attached—to Bareaga’s social feed, a friend, or an existing knowledge system.",
    note: "Sourced clips · Markdown · CSV",
  },
];

const roadmap = [
  {
    horizon: "Now",
    state: "In the works",
    title: "Bring your own feeds",
    body: "Add any valid RSS or Atom URL and fold it into the same source manager, ordering, and topic system.",
  },
  {
    horizon: "Next",
    state: "Planned",
    title: "A desk that follows you",
    body: "Optional accounts and cloud-synced preferences, with local-first reading remaining the default.",
  },
  {
    horizon: "Next",
    state: "Exploring",
    title: "Reading state",
    body: "Mark stories read, collapse a source, and return to a quieter view without turning Bareaga into an inbox.",
  },
  {
    horizon: "Later",
    state: "Exploring",
    title: "Signals worth returning for",
    body: "Saved keyword watches and lightweight alerts for topics you care about—transparent, controllable, and quiet.",
  },
];

export default function ProductPage() {
  return (
    <div className="product-page">
      <header className="product-nav">
        <Link className="product-wordmark" href="/">
          Bareaga
        </Link>
        <nav aria-label="Product navigation">
          <a href="#system">System</a>
          <a href="#roadmap">Roadmap</a>
          <Link href="/archive">Archive</Link>
          <Link href="/social">Social</Link>
          <Link href="/">Open reader ↗</Link>
        </nav>
      </header>

      <section className="product-hero" aria-labelledby="product-title">
        <div className="product-kicker">
          <span>Product / 01</span>
          <span className="product-status">
            <i aria-hidden="true" /> Actively built
          </span>
        </div>

        <div className="product-hero-grid">
          <div>
            <h1 id="product-title">
              The signal,
              <br />
              without the noise.
            </h1>
          </div>
          <div className="product-intro">
            <p>
              Bareaga is a personal front page for the open web: a fast,
              configurable news reader that puts many publications into one
              deliberate view.
            </p>
            <p>
              No recommendation engine. No infinite feed. Just sources you
              chose, ordered by rules you can understand.
            </p>
          </div>
        </div>

        <dl className="product-facts">
          <div>
            <dt>Sources</dt>
            <dd>22 and growing</dd>
          </div>
          <div>
            <dt>Topics</dt>
            <dd>04 desks</dd>
          </div>
          <div>
            <dt>Reading modes</dt>
            <dd>Grid / Top / Focus</dd>
          </div>
          <div>
            <dt>Data posture</dt>
            <dd>Local first</dd>
          </div>
        </dl>
      </section>

      <section className="product-section" id="system">
        <div className="product-section-head">
          <p>01 / The working product</p>
          <h2>A complete reading desk, already live.</h2>
        </div>

        <div className="product-feature-grid">
          {liveFeatures.map((feature) => (
            <article className="product-feature" key={feature.number}>
              <div className="product-feature-top">
                <span>{feature.number}</span>
                <span className="product-live">Live</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
              <small>{feature.note}</small>
            </article>
          ))}
        </div>
        <p className="product-mid-cta">
          <Link href="/">Open the reader <span>↗</span></Link>
          <span>No account required.</span>
        </p>
      </section>

      <section className="product-section product-flow" aria-labelledby="flow-title">
        <div className="product-section-head">
          <p>02 / Under the surface</p>
          <h2 id="flow-title">A short path from source to screen.</h2>
        </div>

        <ol className="product-flow-list">
          <li>
            <span>01</span>
            <strong>Fetch</strong>
            <p>RSS stays server-side, away from browser CORS and publisher quirks.</p>
          </li>
          <li>
            <span>02</span>
            <strong>Normalize</strong>
            <p>Headlines, summaries, authors, dates, and engagement become one clean shape.</p>
          </li>
          <li>
            <span>03</span>
            <strong>Progress</strong>
            <p>Sources arrive in parallel batches, so the first useful stories appear quickly.</p>
          </li>
          <li>
            <span>04</span>
            <strong>Remember</strong>
            <p>Your layout and reading preferences persist locally and remain exportable.</p>
          </li>
        </ol>
      </section>

      <section className="product-section" id="roadmap">
        <div className="product-section-head product-roadmap-head">
          <div>
            <p>03 / What comes next</p>
            <h2>A roadmap, not a promise wall.</h2>
          </div>
          <p className="product-section-note">
            Direction is public. Sequence can change as the product gets used.
          </p>
        </div>

        <div className="product-roadmap">
          {roadmap.map((item, index) => (
            <article key={item.title}>
              <div className="product-roadmap-meta">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>{item.horizon}</span>
                <span>{item.state}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="product-manifesto" aria-labelledby="manifesto-title">
        <p>04 / Product principles</p>
        <h2 id="manifesto-title">
          The reader should feel like a tool you own,
          <br /> not a place trying to own your attention.
        </h2>
        <div className="product-principles">
          <p><span>01</span> Sources over algorithms.</p>
          <p><span>02</span> Finite pages over endless feeds.</p>
          <p><span>03</span> Useful controls over decorative chrome.</p>
          <p><span>04</span> Open formats over locked platforms.</p>
        </div>
      </section>

      <footer className="product-footer">
        <div>
          <p>Ready to read?</p>
          <Link href="/">Open Bareaga <span>↗</span></Link>
        </div>
        <p>Standalone RSS reader · Built for the open web</p>
      </footer>
    </div>
  );
}
