import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { COLLECTION_NOT_FOUND_TITLE } from "@/lib/siteMetadata";

export default function CollectionNotFound() {
  return (
    <AppShell
      section="discover"
      footerNote={<>Public, human-curated collections.</>}
    >
      <div className="public-collection-page public-collection-page--missing">
        <header className="public-collection-hero">
          <p className="public-collection-kicker">[COLLECTION]</p>
          <h1>{COLLECTION_NOT_FOUND_TITLE}</h1>
          <p className="public-collection-lede">
            This published collection is missing, was unpublished, or is not visible with your current access.
          </p>
          <p className="public-collection-actions">
            <Link className="follow-control follow-control--secondary" href="/c">
              Browse collections
            </Link>
            <Link className="follow-control follow-control--secondary" href="/">
              Back to Reader
            </Link>
          </p>
        </header>
      </div>
    </AppShell>
  );
}