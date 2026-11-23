import type { Metadata } from "next";
import { SourcesApp } from "@/components/DiscoverSourcesApp";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata({
  title: "Sources",
  path: "/sources",
  description: "Find publications and add RSS or Atom feeds to your Coeus reader.",
});

export default function SourcesPage() {
  return <SourcesApp />;
}
