# Preview spike — reader view via defuddle (bareaga_web-0bs.4)

Branch: `spike/preview-defuddle`, cut from `main` after the metadata-card work
(`bareaga_web-0bs.1`), then the shared harness cherry-picked from
`spike/preview-readability` so the two branches differ **only** in
`src/lib/readerExtract.server.ts`. Findings feed `bareaga_web-0bs.5`.

## What differs from the Readability branch

Only the engine module. `src/lib/readerExtract.server.ts` uses
`Defuddle` from `defuddle/node` (async; linkedom-backed DOM, no jsdom needed):

- `extractReaderView` is **async** (defuddle returns a Promise). The signature is
  async on both spike branches so every shared file is byte-identical.
- Metadata comes straight from defuddle: `title`, `author`, `description`,
  `image` (used as the lead-image fallback, routed through the proxy),
  `published`, `site`, `wordCount`, `domain`, `schemaOrgData`.
- Output still runs through `sanitizeReaderHtml`, the same block-level
  truncation, and the same `<img>` → same-origin-proxy rewrite.

Everything else — `readerView.ts`, `createReaderView`, the route, the modal,
`scripts/preview-bench.mts`, `scripts/preview-bench-urls.json` — is shared and
identical to `spike/preview-readability`.

## Dependency footprint

| Package | On disk | Ships to browser? |
| --- | --- | --- |
| `linkedom@0.18.13` | 2.6 MB | no |
| `defuddle@<pinned>` | 3.1 MB | no |
| `sanitize-html@2.17.7` | 840 KB | no |

**Client bundle delta: 0.** ~6.5 MB added to the serverless function bundle vs
~3.6 MB for the Readability stack (defuddle is bigger than
`@mozilla/readability`, but linkedom dominates either way; both are far under the
5 GB function limit). `defuddle/node` picks up `linkedom` automatically when
given an HTML string.

## Benchmark

Same harness, same URL set:

```
node --conditions=react-server --import tsx scripts/preview-bench.mts
```

### Partial local run (workstation, 2026-09-10) — `stable` block only

| URL | fetch | extract | words | lead img | byline |
| --- | --- | --- | --- | --- | --- |
| en.wikipedia.org/wiki/Readability | 707ms | trunc | 531 | – | y |
| simonwillison.net/2024/Dec/31/llms-in-2024 | 230ms | trunc | 505 | y | y |
| overreacted.io/a-chain-reaction | 600ms | trunc | 497 | y | – |
| blog.cloudflare.com/making-workers-ai-faster | 262ms | trunc | 507 | y | y |
| danluu.com/input-lag | 377ms | **trunc 456** | – | – | – |
| joelonsoftware.com/2000/…/things-you-should-never-do | 208ms | trunc | 458 | y | y |
| paulgraham.com/greatwork.html | 394ms | **trunc 95** | – | – | – |
| jvns.ca/blog/2023/…/getting-started-with-ssh | – | 404 (stale slug) | – | – | – |

Extraction: **7/7 fetched-and-eligible**. Median extract ~114 ms.

## defuddle vs Readability on the shared `stable` set

| | Readability | defuddle |
| --- | --- | --- |
| Extracted / eligible | 6 / 7 | **7 / 7** |
| Median extract latency | **~64 ms** | ~114 ms |
| Wikipedia extract latency | **166 ms** | 543 ms |
| Byline present | 3 / 6 | **4 / 7** |
| Lead image present | 3 / 6 | **4 / 7** |
| Minimal HTML (danluu) | no content | **extracted** |
| Single-`<font>` essay (Paul Graham) | **465 words** | 95 words (under-extracts) |
| Engine size on disk | **188 KB** | 3.1 MB |
| Metadata richness | title/byline/excerpt/siteName/publishedTime | **+ description/image/published/schemaOrgData/domain** |
| Maintenance | Mozilla, slow but stable cadence | Obsidian (Web Clipper), active, ESM-first |

Observations:

- **defuddle extracts more pages** and gives **richer, more reliable metadata**
  (author, published date, og:image) with no extra work — its whole point is
  being the Web Clipper engine.
- **defuddle is ~2× slower** per extraction and noticeably slower on large pages.
  With a 1 h cache and the fetch dominating wall-clock this is probably fine, but
  it should be confirmed against Vercel cold-start.
- **defuddle under-extracted the Paul Graham page** badly (95 words) where
  Readability's deeper-descent path landed a real excerpt. Old single-`<font>`
  layouts are rare but this is a quality regression to weigh.
- Both stacks carry `linkedom`; defuddle adds ~3 MB more than Readability to the
  function bundle. Neither is close to a limit.

## Recommendation

To be written into `bareaga_web-0bs.5`. Provisional lean: **defuddle**, for the
higher extraction rate and much better metadata (author/date/image feed the card
fallback and any future "saved for later" feature). The latency gap and the
single-node-essay regression are the open risks to check against a Vercel run
with the `refresh` URL block filled in.
