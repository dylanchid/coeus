import type { Metadata } from "next";
import { SourcesApp } from "@/components/DiscoverSourcesApp";

export const metadata: Metadata = {
  title: "Sources — Bareaga",
  description: "Find publications and add RSS or Atom feeds to your Bareaga reader.",
};

export default function SourcesPage() {
  return <SourcesApp />;
}
