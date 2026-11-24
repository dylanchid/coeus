import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { deriveCollectionCards } from "@/lib/profiles/publicProfile";
import { loadProfileIdentity } from "@/lib/profiles/profilePageLoader.server";
import { SupabaseProfileStore } from "@/lib/profiles/profileStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";

export const alt = "A profile on Coeus";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const PAPER = "#f4f1ea";
const INK = "#161512";
const FONT_NAME = "Coeus Serif";

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

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) notFound();

  const { profile } = resolution;
  const admin = createAdminSupabaseClient();
  const rows = await new SupabaseProfileStore(admin).listOwnedPublications(profile.id);
  const titles = deriveCollectionCards(rows, { kind: "anonymous" }, [])
    .filter((card) => card.visibility === "public" && !card.isUnpublished)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 3)
    .map((card) => card.name);

  const fonts = await loadWordmarkFonts();
  const siteHost = "coeuscoeus.com";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: PAPER,
          color: INK,
          padding: "72px 80px 56px",
          ...(fonts ? { fontFamily: FONT_NAME } : {}),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxHeight: 160,
              overflow: "hidden",
            }}
          >
            {profile.displayName}
          </div>
          <div style={{ display: "flex", fontSize: 28, fontFamily: "monospace", letterSpacing: "0.04em" }}>
            @{profile.handle}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: "0.12em",
              fontFamily: "monospace",
              marginBottom: 20,
            }}
          >
            [COLLECTION]
          </div>
          {titles.length ? (
            titles.map((title, index) => (
              <div
                key={title}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, padding: "14px 0" }}>{title}</div>
                {index < titles.length - 1 ? (
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      borderBottom: "2px dashed #b8b2a6",
                    }}
                  />
                ) : null}
              </div>
            ))
          ) : (
            <div style={{ display: "flex", fontSize: 26, color: "#6b665c" }}>No public collections yet.</div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: 22, fontFamily: "monospace", letterSpacing: "0.06em" }}>
          {siteHost}/@{profile.handle}
        </div>
      </div>
    ),
    fonts ? { ...size, fonts } : size,
  );
}