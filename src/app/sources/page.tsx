import type { Metadata } from "next";
import { SourcesApp } from "@/components/DiscoverSourcesApp";

export const metadata: Metadata = {
  title: "Sources — Coeus",
  description: "Find publications and add RSS or Atom feeds to your Coeus reader.",
};

export default function SourcesPage() {
  return <SourcesApp />;
}
