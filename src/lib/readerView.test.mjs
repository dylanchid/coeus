import assert from "node:assert/strict";
import test from "node:test";

import { countWords, resolveHttps, sanitizeReaderHtml } from "./readerView.ts";

const BASE = "https://www.example.com/news/story";

test("countWords ignores surrounding and repeated whitespace", () => {
  assert.equal(countWords("  one   two\nthree  "), 3);
  assert.equal(countWords("   "), 0);
});

test("resolveHttps resolves relative refs and rejects non-https", () => {
  assert.equal(resolveHttps("/a/b.jpg", BASE), "https://www.example.com/a/b.jpg");
  assert.equal(resolveHttps("http://www.example.com/a.jpg", BASE), null);
  assert.equal(resolveHttps("javascript:alert(1)", BASE), null);
  assert.equal(resolveHttps(undefined, BASE), null);
});

test("sanitizer drops scripts, styles, iframes, forms and event handlers", () => {
  const dirty = `
    <p onclick="steal()">Hello <script>evil()</script><style>.x{}</style></p>
    <iframe src="https://ads.example/frame"></iframe>
    <form action="https://phish.example"><input name="pw"></form>
    <p>World</p>`;
  const clean = sanitizeReaderHtml(dirty, BASE);
  assert.doesNotMatch(clean, /<script|<style|<iframe|<form|<input|onclick/i);
  assert.match(clean, /Hello/);
  assert.match(clean, /World/);
});

test("links are forced to https, get rel/target, and bare anchors collapse to spans", () => {
  const clean = sanitizeReaderHtml(
    `<p><a href="/local">local</a> <a href="http://insecure.example/x">insecure</a></p>`,
    BASE,
  );
  assert.match(clean, /<a [^>]*href="https:\/\/www\.example\.com\/local"[^>]*>local<\/a>/);
  assert.match(clean, /<a [^>]*target="_blank"/);
  assert.match(clean, /<a [^>]*rel="noreferrer nofollow"/);
  assert.doesNotMatch(clean, /insecure\.example/);
  assert.match(clean, /<span>insecure<\/span>/);
});

test("relative image srcs are resolved and 1x1 tracking pixels are removed", () => {
  const clean = sanitizeReaderHtml(
    `<p><img src="/lead.jpg" alt="lead"><img src="https://track.example/p.gif" width="1" height="1"></p>`,
    BASE,
  );
  assert.match(clean, /<img src="https:\/\/www\.example\.com\/lead\.jpg" alt="lead"/);
  assert.doesNotMatch(clean, /track\.example/);
});

test("disallowed structural tags are discarded but their text is kept", () => {
  const clean = sanitizeReaderHtml(`<header>nav junk</header><p>real body</p><footer>more junk</footer>`, BASE);
  assert.match(clean, /real body/);
  assert.doesNotMatch(clean, /<header|<footer/i);
});
