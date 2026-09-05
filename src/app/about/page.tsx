import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "About — Bareaga",
  description:
    "How Bareaga helps you find sources, read the open web, discover what people share, and keep what matters.",
};

const sections = [
  {
    number: "01",
    id: "reader",
    label: "Reader",
    href: "/",
    title: "Read the sources you chose.",
    body: "The Reader brings articles from your feeds into one finite page. Switch between a source-by-source grid, balanced coverage, strict recency, or ranking based only on rules you set.",
    details: [
      "Search across loaded headlines and summaries",
      "Save articles or share a sourced clip",
      "Reorder, hide, filter, and refresh sources",
      "Keep publisher failures isolated",
    ],
  },
  {
    number: "02",
    id: "sources",
    label: "Sources",
    href: "/sources",
    title: "Build your reading stack.",
    body: "Sources is the place to find publications for your Reader. Browse the directory by topic, region, language, type, and cadence, or paste any RSS, Atom, blog, or Substack URL.",
    details: [
      "Add and remove feeds from your Reader",
      "Preview a feed before adding it",
      "Rate sources privately for your own sorting",
      "Bring independent and specialist publications together",
    ],
  },
  {
    number: "03",
    id: "discover",
    label: "Discover",
    href: "/discover",
    title: "Follow paths made by people.",
    body: "Discover is for public collections, shared articles, and links with human context attached. It is the people-powered layer of Bareaga—not another engagement-ranked feed.",
    details: [
      "Browse shared articles and sourced passages",
      "Follow public and community collections",
      "Add your perspective without losing the original link",
      "Save discoveries back to your Archive",
    ],
  },
  {
    number: "04",
    id: "archive",
    label: "Archive",
    href: "/archive",
    title: "Keep what is worth returning to.",
    body: "The Archive keeps saved reading with its source, notes, tags, state, and collections. Your library lives locally today and remains portable instead of being locked inside Bareaga.",
    details: [
      "Search titles, notes, tags, sources, and authors",
      "Organize reading into personal collections",
      "Mark items unread, read, kept, or starred",
      "Export Markdown or CSV for other tools",
    ],
  },
];

export default function AboutPage() {
  return (
    <AppShell section="about">
      <div className="about-page">
        <section className="about-hero" aria-labelledby="about-title">
          <p className="about-kicker">About Bareaga</p>
          <h1 id="about-title">A personal front page for the open web.</h1>
          <p>
            Choose where your reading comes from, see why it is ordered the way
            it is, and keep the pieces that matter. No infinite feed and no
            hidden recommendation engine.
          </p>
          <Link className="about-primary-link" href="/">
            Open the Reader <span aria-hidden="true">↗</span>
          </Link>
        </section>

        <nav className="about-jump-nav" aria-label="About Bareaga sections">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="about-sections">
          {sections.map((section) => (
            <section className="about-section" id={section.id} key={section.id}>
              <div className="about-section-heading">
                <p>
                  {section.number} / {section.label}
                </p>
                <h2>{section.title}</h2>
              </div>
              <div className="about-section-copy">
                <p>{section.body}</p>
                <ul>
                  {section.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <Link href={section.href}>
                  Open {section.label} <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </section>
          ))}
        </div>

        <section className="about-principles" aria-labelledby="principles-title">
          <p>How Bareaga is built</p>
          <h2 id="principles-title">A tool you control.</h2>
          <ul>
            <li>Sources over opaque algorithms</li>
            <li>Finite pages over endless feeds</li>
            <li>Useful controls over decorative chrome</li>
            <li>Open formats over locked platforms</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
