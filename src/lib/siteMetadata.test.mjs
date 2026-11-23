import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTION_NOT_FOUND_TITLE,
  DESCRIPTION_MAX,
  PROFILE_NOT_FOUND_TITLE,
  ROBOTS_DISALLOW,
  SITE_DESCRIPTION,
  SITE_TITLE,
  THREAD_NOT_FOUND_TITLE,
  buildSitemap,
  collectionShareText,
  collectionShareTitle,
  pageMetadata,
  profileShareDescription,
  profileShareTitle,
  truncateShareDescription,
} from "./siteMetadata.ts";

test("share descriptions trim and stop at 160 characters with an ellipsis", () => {
  assert.equal(truncateShareDescription("  spaced  "), "spaced");
  assert.equal(truncateShareDescription("a".repeat(DESCRIPTION_MAX)).length, DESCRIPTION_MAX);
  const truncated = truncateShareDescription(`${"a".repeat(DESCRIPTION_MAX)}bc`);
  assert.equal(truncated.length, DESCRIPTION_MAX);
  assert.equal(truncated.endsWith("…"), true);
  assert.equal(truncated.includes("b"), false);
  const cutOnSpace = truncateShareDescription(`${"a".repeat(158)}  more than the limit`);
  assert.ok(cutOnSpace.length <= DESCRIPTION_MAX);
  assert.equal(cutOnSpace.endsWith("…"), true);
  assert.equal(cutOnSpace.endsWith(" …"), false);
});

test("page metadata repeats open graph and twitter because a child replaces the parent", () => {
  const metadata = pageMetadata({
    title: "Sources",
    path: "/sources",
    description: "Find publications and add RSS or Atom feeds to your Coeus reader.",
  });
  assert.equal(metadata.title, "Sources");
  assert.equal(metadata.description?.includes("| Coeus"), false);
  assert.equal(metadata.alternates?.canonical, "/sources");
  assert.equal(metadata.robots, undefined);
  assert.equal(metadata.openGraph?.title, "Sources");
  assert.equal(metadata.openGraph?.description, metadata.description);
  assert.equal(metadata.openGraph?.url, "/sources");
  assert.equal(metadata.openGraph?.type, "website");
  assert.equal(metadata.openGraph?.siteName, "Coeus");
  assert.equal(metadata.openGraph?.locale, "en_US");
  assert.equal(metadata.openGraph?.images?.[0]?.url, "/opengraph-image");
  assert.equal(metadata.openGraph?.images?.[0]?.width, 1200);
  assert.equal(metadata.openGraph?.images?.[0]?.height, 630);
  assert.equal(metadata.twitter?.card, "summary_large_image");
  assert.equal(metadata.twitter?.images?.[0]?.url, "/twitter-image");
  assert.equal(metadata.twitter?.title, "Sources");
  assert.equal(metadata.twitter?.description, metadata.description);
});

test("the home page leaves the document title to the layout default", () => {
  const metadata = pageMetadata({ path: "/", description: `  ${SITE_DESCRIPTION}  ` });
  assert.equal("title" in metadata, false);
  assert.equal(metadata.description, SITE_DESCRIPTION);
  assert.equal(metadata.openGraph?.title, SITE_TITLE);
  assert.equal(metadata.twitter?.title, SITE_TITLE);
  assert.equal(metadata.alternates?.canonical, "/");
  assert.ok(SITE_DESCRIPTION.length <= DESCRIPTION_MAX);
  assert.equal(SITE_TITLE.includes("| Coeus"), false);
});

test("noindex, nofollow, article type, and a summary card are explicit", () => {
  const metadata = pageMetadata({
    title: "Sign in",
    path: "/signin",
    description: "Sign in to sync your archive, publish collections, and connect destinations.",
    noindex: true,
    nofollow: true,
    twitterCard: "summary",
  });
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(metadata.twitter?.card, "summary");

  const archived = pageMetadata({
    title: "Archive",
    path: "/archive",
    description: "Save, tend, connect, and share the pieces of the web worth keeping.",
    noindex: true,
  });
  assert.deepEqual(archived.robots, { index: false, follow: true });

  const article = pageMetadata({
    title: "Field notes by @ada",
    path: "/c/field-notes",
    description: "x".repeat(180),
    ogType: "article",
    types: { "application/rss+xml": "/c/field-notes/rss.xml" },
  });
  assert.equal(article.openGraph?.type, "article");
  assert.equal(article.description?.length, DESCRIPTION_MAX);
  assert.equal(article.description?.endsWith("…"), true);
  assert.deepEqual(article.alternates?.types, { "application/rss+xml": "/c/field-notes/rss.xml" });
  assert.equal(article.robots, undefined);
});

test("collection and profile share text prefer the curator voice and never bake in the title suffix", () => {
  assert.equal(collectionShareTitle("Field notes", "ada"), "Field notes by @ada");
  assert.equal(collectionShareTitle("Field notes", ""), "Field notes");
  assert.equal(collectionShareText("  A note  ", "A description"), "A note");
  assert.equal(collectionShareText("   ", "A description"), "A description");
  assert.equal(collectionShareText("", ""), "");
  assert.equal(profileShareTitle("Ada Lovelace", "ada"), "Ada Lovelace (@ada)");
  assert.equal(profileShareDescription("  Reads slowly.  ", "ada"), "Reads slowly.");
  assert.equal(profileShareDescription("  ", "ada"), "Collections by @ada");
  assert.equal(profileShareDescription(null, "ada"), "Collections by @ada");
  for (const title of [COLLECTION_NOT_FOUND_TITLE, PROFILE_NOT_FOUND_TITLE, THREAD_NOT_FOUND_TITLE]) {
    assert.equal(title.includes("Coeus"), false);
    assert.equal(title.includes("—"), false);
  }
});

test("sitemap lists static routes, public collections, and each curator once", () => {
  const urls = buildSitemap("https://coeus.example", [
    { slug: "field-notes", updatedAt: "2026-11-01T00:00:00.000Z", ownerHandle: "ada" },
    { slug: "second", updatedAt: "2026-10-01T00:00:00.000Z", ownerHandle: "ada" },
    { slug: "orphan", updatedAt: "2026-09-01T00:00:00.000Z", ownerHandle: "" },
  ]).map((entry) => entry.url);

  assert.deepEqual(
    urls.filter((url) => !url.includes("/c/") && !url.includes("/@")),
    [
      "https://coeus.example/",
      "https://coeus.example/about",
      "https://coeus.example/c",
      "https://coeus.example/discover",
      "https://coeus.example/sources",
    ],
  );
  assert.equal(urls.includes("https://coeus.example/product"), false);
  assert.equal(urls.includes("https://coeus.example/social"), false);
  assert.equal(urls.includes("https://coeus.example/c/field-notes"), true);
  assert.equal(urls.includes("https://coeus.example/c/second"), true);
  assert.equal(urls.includes("https://coeus.example/c/orphan"), true);
  assert.equal(urls.filter((url) => url.endsWith("/@ada")).length, 1);
  assert.equal(urls.some((url) => url.endsWith("/@")), false);
});

test("robots disallows private surfaces without trailing slashes on pages", () => {
  assert.ok(ROBOTS_DISALLOW.includes("/signin"));
  assert.ok(ROBOTS_DISALLOW.includes("/plus"));
  assert.ok(ROBOTS_DISALLOW.includes("/api/"));
  assert.ok(ROBOTS_DISALLOW.includes("/auth/"));
  assert.ok(ROBOTS_DISALLOW.includes("/u/"));
  assert.equal(ROBOTS_DISALLOW.includes("/archive"), true);
  assert.equal(ROBOTS_DISALLOW.includes("/archive/"), false);
  assert.equal(ROBOTS_DISALLOW.includes("/signin/"), false);
  assert.equal(ROBOTS_DISALLOW.includes("/welcome"), true);
  assert.equal(ROBOTS_DISALLOW.includes("/notifications"), true);
  assert.equal(ROBOTS_DISALLOW.includes("/messages"), true);
});
