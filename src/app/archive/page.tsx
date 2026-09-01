import type { Metadata } from "next";
import { ArchiveApp } from "@/components/ArchiveApp";

export const metadata: Metadata = {
  title: "Archive — Bareaga",
  description: "Save, tend, connect, and share the pieces of the web worth keeping.",
};

export default function ArchivePage() {
  return <ArchiveApp />;
}

