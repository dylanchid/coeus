import assert from "node:assert/strict";
import test from "node:test";

import { extractReaderView, READER_ENGINE } from "./readerExtract.server.ts";

const BASE = "https://www.example.com/news/story";

function articleHtml(paragraphs, extraHead = "") {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("");
  return `<!doctype html><html><head><title>The Headline</title>${extraHead}</head>
    <body><nav>site nav</nav><article><h1>The Headline</h1>${body}</article><footer>site footer</footer></body></html>`;
}

const LOREM = "This sentence has a comfortable number of words so the extractor treats the block as real prose rather than chrome.";

test("engine id is exported for the benchmark harness", () => {
  assert.equal(typeof READER_ENGINE, "string");
});

test("extracts title, byline, body and word count from an article", async () => {
  const html = articleHtml(Array.from({ length: 6 }, () => LOREM), `<meta name="author" content="Jane Doe">`);
  const view = await extractReaderView(html, BASE);
  assert.ok(view);
  assert.equal(view.title, "The Headline");
  assert.equal(view.byline, "Jane Doe");
  assert.ok(view.wordCount > 50);
  assert.match(view.contentHtml, /comfortable number of words/);
  assert.doesNotMatch(view.contentHtml, /site nav|site footer/);
});

test("returns null when there is no article-like content", async () => {
  assert.equal(await extractReaderView("<!doctype html><html><body><ul><li>link</li><li>link</li></ul></body></html>", BASE), null);
});

test("scripts in the source never survive into the reader body", async () => {
  const html = articleHtml([
    `${LOREM}<script>tracker()</script>`,
    LOREM, LOREM, LOREM,
  ]);
  const view = await extractReaderView(html, BASE);
  assert.ok(view);
  assert.doesNotMatch(view.contentHtml, /<script|tracker\(/i);
});

test("inline images are rewritten to the same-origin proxy and become the lead image", async () => {
  const html = articleHtml([
    `${LOREM} <img src="/media/lead.jpg" alt="lead">`,
    LOREM, LOREM, LOREM,
  ]);
  const view = await extractReaderView(html, BASE);
  assert.ok(view);
  assert.match(view.contentHtml, /<img[^>]+src="\/api\/article-preview\/image\?url=https%3A%2F%2Fwww\.example\.com%2Fmedia%2Flead\.jpg"/);
  assert.equal(view.leadImage, "/api/article-preview/image?url=" + encodeURIComponent("https://www.example.com/media/lead.jpg"));
  assert.doesNotMatch(view.contentHtml, /src="https:\/\/www\.example\.com\/media/);
});

test("content past the word budget is truncated and flagged", async () => {
  const view = await extractReaderView(articleHtml(Array.from({ length: 80 }, () => LOREM)), BASE);
  assert.ok(view);
  assert.equal(view.truncated, true);
  assert.ok(view.wordCount <= 500);
});
