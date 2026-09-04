import assert from "node:assert/strict";
import test from "node:test";

import { renderCollectionRss } from "./collectionPublicationRss.ts";

function publication(overrides = {}) {
  return {
    id: "pub-1",
    archiveId: "archive-1",
    collectionLocalId: "humane-internet",
    slug: "a-humane-internet",
    visibility: "public",
    name: "A humane internet",
    description: "Protocols, places, and practices that make the web feel inhabited.",
    curatorNote: "A running list of things I keep coming back to.",
    attribution: "Curated by You",
    publishedAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-05T09:30:00.000Z",
    unpublishedAt: null,
    items: [
      {
        itemLocalId: "demo-links",
        position: 1,
        title: "Cool URIs don't change",
        url: "https://www.w3.org/Provider/Style/URI",
        sourceName: "W3C",
        author: "Tim Berners-Lee",
        excerpt: "A durable web depends on durable addresses.",
        curatorComment: "",
      },
      {
        itemLocalId: "demo-rfc-8890",
        position: 0,
        title: "The Internet is for End Users",
        url: "https://www.rfc-editor.org/rfc/rfc8890.html",
        sourceName: "RFC Editor",
        author: "M. Nottingham",
        excerpt: "Why the Internet's architecture should prioritize end users.",
        curatorComment: "Start here.",
      },
    ],
    ...overrides,
  };
}

const options = { feedUrl: "https://bareaga.example/c/a-humane-internet/rss.xml", collectionUrl: "https://bareaga.example/c/a-humane-internet" };

test("renderCollectionRss produces a well-formed RSS 2.0 document", () => {
  const xml = renderCollectionRss(publication(), options);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<channel>[\s\S]*<\/channel>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.equal((xml.match(/<\/item>/g) ?? []).length, 2);
});

test("renderCollectionRss orders items by position, not array order", () => {
  const xml = renderCollectionRss(publication(), options);
  const rfcIndex = xml.indexOf("rfc8890.html");
  const uriIndex = xml.indexOf("Provider/Style/URI");
  assert.ok(rfcIndex >= 0 && uriIndex >= 0);
  assert.ok(rfcIndex < uriIndex, "position 0 item should render before position 1 item");
});

test("renderCollectionRss escapes XML-significant characters in curator-supplied text", () => {
  const xml = renderCollectionRss(
    publication({
      name: 'Tools & "Tricks" <for> thought',
      items: [{
        itemLocalId: "x",
        position: 0,
        title: "A & B",
        url: "https://example.com/?a=1&b=2",
        sourceName: "",
        author: "",
        excerpt: "",
        curatorComment: '<script>alert(1)</script>',
      }],
    }),
    options
  );
  assert.doesNotMatch(xml.split("<title>Tools")[0], /alert\(1\)/);
  assert.match(xml, /Tools &amp; &quot;Tricks&quot; &lt;for&gt; thought/);
  assert.match(xml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(xml, /<script>/);
  assert.match(xml, /href="1&amp;b=2"|a=1&amp;b=2/);
});

test("renderCollectionRss omits an empty item description rather than emitting an empty tag", () => {
  const xml = renderCollectionRss(
    publication({
      items: [{ itemLocalId: "x", position: 0, title: "T", url: "https://example.com", sourceName: "", author: "", excerpt: "", curatorComment: "" }],
    }),
    options
  );
  assert.doesNotMatch(xml, /<description><\/description>/);
});

test("renderCollectionRss includes a self-referencing atom:link using the provided feed URL", () => {
  const xml = renderCollectionRss(publication(), options);
  assert.match(xml, /<atom:link href="https:\/\/bareaga\.example\/c\/a-humane-internet\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/);
});
