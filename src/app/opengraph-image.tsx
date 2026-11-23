import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

export const alt = "Coeus, a personal front page for the open web.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#f4f1ea";
const INK = "#161512";
const FONT_NAME = "Coeus Serif";

/**
 * ImageResponse cannot use `next/font` (those are CSS variables, not glyph
 * files). Try a serif TTF already on the machine, and render with the
 * built-in face when none is readable. Hosted builds often have no system
 * fonts; the card still paints Paper and ink.
 */
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
      // Absolute system paths are optional. Ignore them in the file tracer so a
      // missing font does not pull the whole project into the server bundle.
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

export default async function Image() {
  const fonts = await loadWordmarkFonts();
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
          fontFamily: fonts ? FONT_NAME : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 92,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          Coeus
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 36,
            lineHeight: 1.35,
            maxWidth: 860,
          }}
        >
          A personal front page for the open web.
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
