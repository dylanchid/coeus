import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata({
  title: "About",
  path: "/about",
  description:
    "How Coeus helps you read Sources, keep saved items in collections, publish collections with your @handle, and let others Follow your work.",
});

const sections = [
  {
    number: "01",
    id: "read",
    label: "READ",
    href: "/",
    title: "Read on a finite page.",
    body: "The Reader loads Articles from the Sources you chose into one bounded view. Sources is where you find feeds—browse the directory or add any RSS, Atom, or blog URL.",
    details: [
      "Choose balance, recency, or your own ranking rules",
      "Search across loaded headlines and summaries",
      "Add, remove, and preview Sources before they land in the Reader",
      "Keep publisher failures isolated so one broken feed does not break the page",
    ],
  },
  {
    number: "02",
    id: "save",
    label: "SAVE",
    href: "/archive",
    title: "Keep saved items worth returning to.",
    body: "The Archive holds saved items with their Source, notes, tags, state, and Collections. Your library stays portable instead of being locked inside Coeus.",
    details: [
      "Save Articles from the Reader into your Archive",
      "Search titles, notes, tags, Sources, and authors",
      "Organize saved items into Collections with your own notes",
      "Mark items unread, read, kept, or starred; export Markdown or CSV",
    ],
  },
  {
    number: "03",
    id: "publish",
    label: "PUBLISH",
    href: "/archive",
    title: "Turn a Collection into a published collection.",
    body: "When a Collection is ready, publish it: a stable link, an RSS feed, and visibility you control—Private, Unlisted, or Published.",
    details: [
      "Publish a Collection with a durable URL and feed",
      "Move from Private to Unlisted to Published when you are ready",
      "Attribution stays on the curator, not the algorithm",
      "Readers can Follow collection to add it to their Reader",
    ],
  },
  {
    number: "04",
    id: "share",
    label: "SHARE",
    href: "/discover",
    title: "Put your Profile on the open web.",
    body: "Your Profile lives at /@handle with a public feed at /@handle/rss.xml. People can Follow collection for the Reader or Follow @handle for Discover · Following.",
    details: [
      "Claim an @handle so published collections have a home",
      "Share a Profile link and RSS outside Coeus",
      "Follow collection subscribes a published collection to the Reader",
      "Follow @handle surfaces a curator in Discover · Following only",
    ],
  },
];

export default function AboutPage() {
  return (
    <AppShell section="about">
      <div className="about-page">
        <section className="about-hero" aria-labelledby="about-title">
          <p className="about-kicker">About Coeus</p>
          <h1 id="about-title">A personal front page for the open web.</h1>
          <p>
            Read the sources you choose on one finite page. Keep what was worth it in collections,
            publish them with your @handle, and anyone can follow them here or in any RSS reader.
          </p>
          <Link className="about-primary-link" href="/archive">
            Start a collection →
          </Link>
          <Link className="about-primary-link" href="/">
            Open the Reader <span aria-hidden="true">↗</span>
          </Link>
        </section>

        <nav className="about-jump-nav" aria-label="About Coeus sections">
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
          <p>How Coeus is built</p>
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