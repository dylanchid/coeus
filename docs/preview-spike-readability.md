# Preview spike — reader view via @mozilla/readability (bareaga_web-0bs.3)

Branch: `spike/preview-readability`, cut from `main` after the metadata-card
work (`bareaga_web-0bs.1`). Parallel branch: `spike/preview-defuddle`
(`bareaga_web-0bs.4`). Findings feed the decision bead `bareaga_web-0bs.5`.

## What this branch adds

| File | Role |
| --- | --- |
| `src/lib/readerView.ts` | Pure. `ReaderView` type, `sanitizeReaderHtml` (allowlist, https-only, tracking-pixel drop), `countWords`, `resolveHttps`, `EXCERPT_WORD_BUDGET = 450`. |
| `src/lib/readerExtract.server.ts` | **Engine-specific.** `extractReaderView(html, baseUrl)` → linkedom DOM → `Readability.parse()` → sanitize → block-level truncate → rewrite `<img>` to the same-origin proxy. `READER_ENGINE = "readability"`. |
| `src/lib/articlePreview.server.ts` | `createReaderView(url)` — same policy gates as the card (opt-out, robots, page directives, paywall heuristic), 1h in-process cache. |
| `src/app/api/article-preview/reader/route.ts` | JSON endpoint, rate-limited like the sibling routes. |
| `src/components/ArticlePreview.tsx` | `StaticSourcePreview` now tries reader → card → unavailable. |
| `scripts/preview-bench.mts` + `scripts/preview-bench-urls.json` | Shared benchmark harness (identical on both spike branches). |

Tests: `readerView.test.mjs` (6), `readerExtract.server.test.mjs` (6),
one interaction test. `npm test` + `lint` + `build` green.

The in-route Playwright path is untouched — `bareaga_web-0bs.6` retires it
after the engine decision.

## Security / policy posture

- Output HTML is cleaned by `sanitize-html` with a tag/attr allowlist before it
  leaves the server; the modal renders it via `dangerouslySetInnerHTML`. No
  `script`/`style`/`iframe`/`form`/`on*` survives; `a`/`img` are https-only and
  relative URLs are resolved against the article.
- Inline images are rewritten to `/api/article-preview/image` so `img-src 'self'`
  is unchanged and the fetch stays anonymous (same rationale as the card).
- Truncated to ~450 words / whole blocks, with a deeper descent for single-node
  essays, so the excerpt stays a navigation aid, not a reading surface (PRD
  6.1.2). Legal review flagged in PRD 6.1.2 applies to extracted text too.

## Dependency footprint

| Package | On disk | Ships to browser? |
| --- | --- | --- |
| `linkedom@0.18.13` | 2.6 MB | no |
| `sanitize-html@2.17.7` | 840 KB | no |
| `@mozilla/readability@0.6.0` | 188 KB | no |

**Client bundle delta: 0** — the modal only does `fetch`; extraction is
server-only. ~3.6 MB added to the serverless function bundle (limit is 5 GB).
Cold-start cost of `require("linkedom")` is not yet measured on Vercel.

## Benchmark

Run from the deploy region:

```
node --conditions=react-server --import tsx scripts/preview-bench.mts
```

`scripts/preview-bench-urls.json` has a verified `stable` block and a `refresh`
block of one placeholder per paywalled publisher — **fill the `refresh` slots
with current front-page articles before a real run** and record the swaps here.

### Partial local run (workstation, 2026-09-10) — `stable` block only

| URL | fetch | extract | words | lead img | byline |
| --- | --- | --- | --- | --- | --- |
| en.wikipedia.org/wiki/Readability | 580ms | trunc | 465→ | – | y |
| simonwillison.net/2024/Dec/31/llms-in-2024 | 113ms | trunc | 517 | y | y |
| overreacted.io/a-chain-reaction | 211ms | trunc | 497 | – | – |
| blog.cloudflare.com/making-workers-ai-faster | 85ms | trunc | 507 | – | – |
| danluu.com/input-lag | 107ms | **no content** | – | – | – |
| joelonsoftware.com/2000/…/things-you-should-never-do | 703ms | trunc | 458 | y | y |
| paulgraham.com/greatwork.html | 583ms | trunc | 465 | – | – |
| jvns.ca/blog/2023/…/getting-started-with-ssh | – | 404 (stale slug) | – | – | – |

Extraction: **6/7 fetched-and-eligible**. Median extract ~64 ms.

### Observations to weigh against the defuddle spike

- **Minimal HTML** (danluu): Readability's `isProbablyReaderable` / `charThreshold`
  rejects very sparse markup with no semantic containers. Real article, no output.
- **Single-node essays** (Paul Graham, old Joel): whole body is one `<font>`/`<td>`
  blob. Needed a custom deeper-descent truncation pass; block-level trimming alone
  did not bound the excerpt.
- **Byline**: present ~50% of the time; Readability's `byline` is weak on blogs.
- **Metadata**: Readability returns `title`, `byline`, `excerpt`, `siteName`,
  `publishedTime`, `lang` — thinner than defuddle's documented set.
- Paywalled publishers (WSJ/Economist/Reuters/FT) 401/403 from a workstation and
  hit the paywall heuristic when they do load — re-run from Vercel.

## Recommendation

To be written into `bareaga_web-0bs.5` after the defuddle spike reports on the
same URL set.
