/**
 * Reader-view extraction benchmark for the preview spikes
 * (bareaga_web-0bs.3 Readability / bareaga_web-0bs.4 defuddle).
 *
 * Runs the branch's extraction engine over a shared URL set and prints a table
 * plus summary. The list lives in scripts/preview-bench-urls.json — keep it
 * identical on both branches so the numbers are comparable.
 *
 *   node --conditions=react-server --import tsx scripts/preview-bench.mts
 *   node --conditions=react-server --import tsx scripts/preview-bench.mts --json
 *   node --conditions=react-server --import tsx scripts/preview-bench.mts --url=https://…
 *
 * (--conditions=react-server lets `server-only` resolve to a no-op outside Next.)
 *
 * Note: run this where the app runs (or close to it). From a workstation many
 * publishers will 403 / paywall-wall the fetch; that is itself a data point,
 * but latency and success-rate only mean something from the deploy region.
 */
import { readFile } from "node:fs/promises";

import { fetchSafeContent } from "../src/lib/safeContentFetch.server.ts";
import { pageAppearsAccessRestricted, pageDisallowsPreview } from "../src/lib/articlePreviewPolicy.ts";
import { extractReaderView, READER_ENGINE } from "../src/lib/readerExtract.server.ts";

type Row = {
  url: string;
  httpOk: boolean;
  optedOut: boolean;
  extracted: boolean;
  words: number;
  truncated: boolean;
  leadImage: boolean;
  byline: boolean;
  fetchMs: number;
  extractMs: number;
  note: string;
};

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const single = args.find((a) => a.startsWith("--url="))?.slice("--url=".length);

async function loadUrls(): Promise<string[]> {
  if (single) return [single];
  const raw = await readFile(new URL("./preview-bench-urls.json", import.meta.url), "utf8");
  const list = JSON.parse(raw) as { stable?: string[]; refresh?: string[]; urls?: string[] };
  const urls = [...(list.urls ?? []), ...(list.stable ?? []), ...(list.refresh ?? [])];
  const skipped = urls.filter((u) => /REPLACE/.test(u));
  if (skipped.length) {
    console.warn(`skipping ${skipped.length} placeholder URL(s) — edit scripts/preview-bench-urls.json 'refresh' block for a full run\n`);
  }
  return urls.filter((u) => !/REPLACE/.test(u));
}

async function run(url: string): Promise<Row> {
  const row: Row = {
    url, httpOk: false, optedOut: false, extracted: false, words: 0,
    truncated: false, leadImage: false, byline: false, fetchMs: 0, extractMs: 0, note: "",
  };
  try {
    const t0 = performance.now();
    const captured = await fetchSafeContent(url);
    row.fetchMs = Math.round(performance.now() - t0);
    row.httpOk = true;
    const html = new TextDecoder().decode(captured.body);
    if (pageDisallowsPreview(html, captured.responseHeaders) || pageAppearsAccessRestricted(html, captured.responseHeaders)) {
      row.optedOut = true;
      row.note = "page opts out / paywalled";
      return row;
    }
    const t1 = performance.now();
    const view = await extractReaderView(html, captured.fetchedUrl);
    row.extractMs = Math.round(performance.now() - t1);
    if (!view) {
      row.note = "no article-like content";
      return row;
    }
    row.extracted = true;
    row.words = view.wordCount;
    row.truncated = view.truncated;
    row.leadImage = Boolean(view.leadImage);
    row.byline = Boolean(view.byline);
  } catch (error) {
    row.note = error instanceof Error ? error.message : String(error);
  }
  return row;
}

const urls = await loadUrls();
const rows: Row[] = [];
for (const url of urls) {
  rows.push(await run(url));
}

if (asJson) {
  console.log(JSON.stringify({ engine: READER_ENGINE, rows }, null, 2));
} else {
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log(`\nEngine: ${READER_ENGINE}   URLs: ${rows.length}\n`);
  console.log(pad("url", 44), pad("http", 5), pad("extract", 8), pad("words", 6), pad("img", 4), pad("byline", 7), pad("fetch", 6), pad("extr", 5), "note");
  for (const r of rows) {
    console.log(
      pad(r.url.replace(/^https?:\/\//, ""), 44),
      pad(r.httpOk ? "ok" : "FAIL", 5),
      pad(r.optedOut ? "optout" : r.extracted ? (r.truncated ? "trunc" : "full") : "no", 8),
      pad(String(r.words || ""), 6),
      pad(r.leadImage ? "y" : "", 4),
      pad(r.byline ? "y" : "", 7),
      pad(r.fetchMs ? `${r.fetchMs}ms` : "", 6),
      pad(r.extractMs ? `${r.extractMs}ms` : "", 5),
      r.note,
    );
  }
  const fetched = rows.filter((r) => r.httpOk);
  const eligible = fetched.filter((r) => !r.optedOut);
  const ok = rows.filter((r) => r.extracted);
  const med = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  console.log(
    `\nfetched ${fetched.length}/${rows.length} · eligible ${eligible.length} · extracted ${ok.length}` +
    ` (${eligible.length ? Math.round((ok.length / eligible.length) * 100) : 0}% of eligible)`,
  );
  console.log(
    `median fetch ${med(fetched.map((r) => r.fetchMs))}ms · median extract ${med(ok.map((r) => r.extractMs))}ms` +
    ` · median words ${med(ok.map((r) => r.words))} · lead image ${ok.filter((r) => r.leadImage).length}/${ok.length}` +
    ` · byline ${ok.filter((r) => r.byline).length}/${ok.length}`,
  );
}
