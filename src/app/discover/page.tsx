import type { Metadata } from "next";
import { DiscoverSourcesApp } from "@/components/DiscoverSourcesApp";

export const metadata: Metadata = {
  title: "Discover Sources · Bareaga",
  description: "Explore and add news, research, culture, and primary-source feeds to Bareaga.",
};

export default function DiscoverPage() {
  return <DiscoverSourcesApp />;
}
