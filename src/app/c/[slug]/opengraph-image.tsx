import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { SupabaseProfileStore } from "@/lib/profiles/profileStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";
import { collectionEyebrowKicker } from "@/lib/publications/publishLadder";

export const alt = "A published collection on Coeus";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const PAPER = "#f4f1ea";
const INK = "#161512";
const SALMON = "#e8b49a";
const FONT_NAME = "Coeus Serif";
const DEFAULT_TITLE = "Coeus";
const DEFAULT_TAGLINE = "A personal front page for the open web.";

const FONT_PAIRS = [
  [
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
  ],
  [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  ],
] as const;

function fontData(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function loadWordmarkFonts(): Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | undefined
> {
  for (const [regularPath, boldPath] of FONT_PAIRS) {
    try {
      const [regular, bold] = await Promise.all([
        readFile(/*turbopackIgnore: true*/ regularPath),
        readFile(/*turbopackIgnore: true*/ boldPath),
      ]);
      return [
        { name: FONT_NAME, data: fontData(regular), weight: 400, style: "normal" },
        { name: FONT_NAME, data: fontData(bold), weight: 700, style: "normal" },
      ];
    } catch {
      // Try the next face, then the default.
    }
  }
  return undefined;
}

function topSources(items: readonly { sourceName: string }[]): { line: string; extra: number } {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = item.sourceName.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, 2).map(([name]) => name.toUpperCase());
  const extra = Math.max(0, ranked.length - 2);
  return { line: top.join(" · "), extra };
}

function defaultCard(fonts: Awaited<ReturnType<typeof loadWordmarkFonts>>) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: PAPER,
          color: INK,
          padding: "88px",
          ...(fonts ? { fontFamily: FONT_NAME } : {}),
        }}
      >
        <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em" }}>
          {DEFAULT_TITLE}
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 36, lineHeight: 1.35, maxWidth: 860 }}>
          {DEFAULT_TAGLINE}
        </div>
      </div>
    ),
    fonts ? { ...size, fonts } : size,
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const publication = await new SupabaseCollectionPublicationStore(createAdminSupabaseClient()).getBySlug(slug);
  if (!publication) notFound();
  const fonts = await loadWordmarkFonts();

  if (publication.visibility === "private" || publication.visibility === "followers") {
    notFound();
  }
  if (publication.visibility === "unlisted") {
    return defaultCard(fonts);
  }

  const curator = await new SupabaseProfileStore(createAdminSupabaseClient()).get(publication.ownerId);
  const handle = curator?.handle ? `@${curator.handle}` : "";
  const { line: sourcesLine, extra } = topSources(publication.items);
  const footerParts = [
    `${publication.items.length} ENTRIES`,
    sourcesLine ? `${sourcesLine}${extra > 0 ? ` +${extra}` : ""}` : null,
    "COEUS",
  ].filter(Boolean);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: PAPER,
          color: INK,
          ...(fonts ? { fontFamily: FONT_NAME } : {}),
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            backgroundColor: SALMON,
            padding: "28px 72px",
            fontSize: 22,
            letterSpacing: "0.12em",
            fontFamily: "monospace",
          }}
        >
          {collectionEyebrowKicker("public")}
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "56px 72px 48px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                maxHeight: 220,
                overflow: "hidden",
              }}
            >
              {publication.name}
            </div>
            {handle ? (
              <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3 }}>
                by {handle}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "monospace",
            }}
          >
            {footerParts.join(" · ")}
          </div>
        </div>
      </div>
    ),
    fonts ? { ...size, fonts } : size,
  );
}