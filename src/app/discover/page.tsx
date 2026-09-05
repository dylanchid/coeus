import type { Metadata } from "next";
import { DiscoverApp } from "@/components/SocialApp";

export const metadata: Metadata = {
  title: "Discover — Coeus",
  description: "Explore collections, articles, and links shared by people across the open web.",
};

export default function DiscoverPage() {
  return <DiscoverApp />;
}
