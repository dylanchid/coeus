import assert from "node:assert/strict";
import test from "node:test";

import { renderProfileRss } from "./profileRss.ts";

const identity = {
  handle: "ada",
  displayName: "Ada Lovelace",
  bio: "Analytical engines and curious collections.",
};

const options = {
  feedUrl: "https://coeus.example/@ada/rss.xml",
  profileUrl: "https://coeus.example/@ada",
  origin: "https://coeus.example",
};

test("renderProfileRss produces well-formed RSS 2.0 with channel metadata", () => {
  const xml = renderProfileRss(identity, [], options);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<title>Ada Lovelace \(@ada\)<\/title>/);
  assert.match(xml, /<link>https:\/\/coeus\.example\/@ada<\/link>/);
  assert.match(xml, /<atom:link href="https:\/\/coeus\.example\/@ada\/rss\.xml" rel="self"/);
  assert.match(xml, /<description>Analytical engines and curious collections\.<\/description>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 0);
});

test("renderProfileRss falls back to handle-based description when bio is empty", () => {
  const xml = renderProfileRss({ ...identity, bio: null }, [], options);
  assert.match(xml, /<description>Collections by @ada<\/description>/);
});

test("renderProfileRss emits one item per collection with curator note preferred", () => {
  const xml = renderProfileRss(
    identity,
    [
      {
        slug: "notes",
        name: "Field notes",
        description: "A running index.",
        curatorNote: "Start here.",
        publishedAt: "2026-06-06T12:00:00.000Z",
      },
    ],
    options,
  );
  assert.equal((xml.match(/<item>/g) ?? []).length, 1);
  assert.match(xml, /<title>Field notes<\/title>/);
  assert.match(xml, /<link>https:\/\/coeus\.example\/c\/notes<\/link>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/coeus\.example\/c\/notes<\/guid>/);
  assert.match(xml, /<description>Start here\.<\/description>/);
  assert.match(xml, /<pubDate>/);
});

test("renderProfileRss escapes XML-significant characters", () => {
  const xml = renderProfileRss(
    { handle: "x", displayName: 'Ada & "Lovelace"', bio: null },
    [
      {
        slug: "a-b",
        name: 'Tools & <tricks>',
        description: "",
        curatorNote: 'Curated with "care"',
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    options,
  );
  assert.match(xml, /<title>Tools &amp; &lt;tricks&gt;<\/title>/);
  assert.match(xml, /<description>Curated with &quot;care&quot;<\/description>/);
});