import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Newsreader, Roboto_Slab, Syne } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-ibm-plex-mono",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const robotoSlab = Roboto_Slab({ subsets: ["latin"], variable: "--font-roboto-slab" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne" });
const fontVariables = [
  ibmPlexMono.variable,
  dmSans.variable,
  newsreader.variable,
  robotoSlab.variable,
  syne.variable,
].join(" ");

// Set this public value to the canonical HTTPS deployment origin in production.
// The local default keeps metadata deterministic for development and CI.
const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: { default: "Coeus", template: "%s | Coeus" },
  description:
    "Headlines, bare — transparent story ordering, keyword search, and a configurable reading surface.",
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={fontVariables} lang="en" data-theme="system" data-palette="ink" data-font="mono">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <AppProviders><main id="main-content" tabIndex={-1}>{children}</main></AppProviders>
      </body>
    </html>
  );
}
