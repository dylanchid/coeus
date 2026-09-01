import type { Metadata } from "next";
import { SocialApp } from "@/components/SocialApp";

export const metadata: Metadata = {
  title: "Social — Bareaga",
  description: "Share sourced clips, follow public collections, and build paths through the web together.",
};

export default function SocialPage() {
  return <SocialApp />;
}

