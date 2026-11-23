import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Newsreader, Pochaevsk, Roboto_Slab, Syne } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/siteMetadata";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-ibm-plex-mono",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const pochaevsk = Pochaevsk({ subsets: ["latin"], weight: "400", variable: "--font-pochaevsk" });
const robotoSlab = Roboto_Slab({ subsets: ["latin"], variable: "--font-roboto-slab" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne" });
const fontVariables = [
  ibmPlexMono.variable,
  dmSans.variable,
  newsreader.variable,
  pochaevsk.variable,
  robotoSlab.variable,
  syne.variable,
].join(" ");

// Set this public value to the canonical HTTPS deployment origin in production.
// The local default keeps metadata deterministic for development and CI.
const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US" },
  twitter: { card: "summary_large_image" },
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
