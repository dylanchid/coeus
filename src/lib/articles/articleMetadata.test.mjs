import assert from "node:assert/strict";
import test from "node:test";

import { extractArticleCard } from "./articleMetadata.ts";

const BASE = "https://www.example.com/news/story";

test("prefers OpenGraph, resolves a relative image, and derives the bare domain", () => {
  const html = `
    <head>
      <meta property="og:title" content="The headline">
      <meta property="og:description" content="A short standfirst.">
      <meta property="og:site_name" content="Example News">
      <meta property="og:image" content="/media/lead.jpg">
      <link rel="icon" href="/favicon-32.png">
    </head>`;
  const card = extractArticleCard(html, BASE);
  assert.equal(card.title, "The headline");
  assert.equal(card.description, "A short standfirst.");
  assert.equal(card.siteName, "Example News");
  assert.equal(card.domain, "example.com");
  assert.equal(card.imageUrl, "https://www.example.com/media/lead.jpg");
  assert.equal(card.faviconUrl, "https://www.example.com/favicon-32.png");
});

test("falls back to Twitter tags, then the document title and meta description", () => {
  const html = `
    <title>Fallback headline &amp; more</title>
    <meta name="twitter:image" content="https://cdn.example.com/t.png">
    <meta name="description" content="Plain meta description.">`;
  const card = extractArticleCard(html, BASE);
  assert.equal(card.title, "Fallback headline & more");
  assert.equal(card.description, "Plain meta description.");
  assert.equal(card.imageUrl, "https://cdn.example.com/t.png");
});

test("attribute order and single quotes do not matter", () => {
  const html = `<meta content='Ordered last' property='og:title'>`;
  assert.equal(extractArticleCard(html, BASE).title, "Ordered last");
});

test("collects all publisher labels while keeping derived suggestions inspectable", () => {
  const html = `
    <meta property="article:tag" content="Digital culture">
    <meta property="article:tag" content="Independent media">
    <meta name="keywords" content="archives, publishing">
    <meta property="og:title" content="Archives on the open web">`;
  const card = extractArticleCard(html, BASE);
  assert.deepEqual(card.index.publisherTags, ["digital culture", "independent media", "archives", "publishing"]);
  assert.ok(card.index.keywords.includes("archives"));
});

test("an apple-touch-icon wins over a plain icon link", () => {
  const html = `
    <link rel="icon" href="/small.ico">
    <link rel="apple-touch-icon" href="/touch.png">`;
  assert.equal(extractArticleCard(html, BASE).faviconUrl, "https://www.example.com/touch.png");
});

test("non-https and unparseable image references are dropped; favicon defaults to /favicon.ico", () => {
  const html = `<meta property="og:image" content="http://insecure.example.com/x.jpg">`;
  const card = extractArticleCard(html, BASE);
  assert.equal(card.imageUrl, null);
  assert.equal(card.faviconUrl, "https://www.example.com/favicon.ico");
});

test("a page with no usable metadata still yields the domain and null media", () => {
  const card = extractArticleCard("<p>nothing here</p>", BASE);
  assert.equal(card.title, "");
  assert.equal(card.description, "");
  assert.equal(card.siteName, "example.com");
  assert.equal(card.imageUrl, null);
  assert.equal(card.faviconUrl, "https://www.example.com/favicon.ico");
});
