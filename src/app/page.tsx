import type { Metadata } from "next";
import { NewsApp } from "@/components/NewsApp";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata({
  path: "/",
  description: SITE_DESCRIPTION,
});

export default function Home() {
  return <NewsApp />;
}
