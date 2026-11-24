import Link from "next/link";
import { SOURCE_CATALOG } from "@/lib/feeds/sources";
import { SITE_DESCRIPTION } from "@/lib/siteMetadata";

/** Hook-free boot markup for / when preferences have not hydrated yet. */
export function ReaderIntro() {
  return (
    <div className="reader-intro">
      <h1>A personal front page for the open web.</h1>
      <p>{SITE_DESCRIPTION}</p>
      <nav className="reader-intro-nav" aria-label="Explore Coeus">
        <Link href="/c">Published collections</Link>
        <Link href="/sources">Browse {SOURCE_CATALOG.length} sources</Link>
        <Link href="/about">About</Link>
      </nav>
      <p role="status">Loading your sources…</p>
    </div>
  );
}