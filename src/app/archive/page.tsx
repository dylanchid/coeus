import type { Metadata } from "next";
import { ArchiveApp } from "@/components/ArchiveApp";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata({
  title: "Archive",
  path: "/archive",
  description: "Save, tend, connect, and share the pieces of the web worth keeping.",
  noindex: true,
});

export default function ArchivePage() {
  return <ArchiveApp />;
}

