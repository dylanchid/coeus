import assert from "node:assert/strict";
import test from "node:test";

import { deriveProfileView, DEFAULT_SECTION_SWITCHES } from "./publicProfile.ts";

const PROFILE_ID = "00000000-0000-0000-0000-000000000001";

const OWNER = { kind: "owner", id: PROFILE_ID };
const FOLLOWER = { kind: "follower", id: "00000000-0000-0000-0000-0000000000f0" };
const SIGNED_IN = { kind: "signed-in", id: "00000000-0000-0000-0000-0000000000a0" };
const ANON = { kind: "anonymous" };

function profile(overrides = {}) {
  return {
    id: PROFILE_ID,
    handle: "ada",
    displayName: "Ada Lovelace",
    bio: "Countess of computing",
    location: "London",
    links: [{ label: "Site", url: "https://ada.example" }],
    avatarUrl: null,
    coverUrl: null,
    pinnedCollectionSlugs: [],
    sections: DEFAULT_SECTION_SWITCHES,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function pub(overrides = {}) {
  return {
    id: "pub-1",
    slug: "notes",
    name: "Notes",
    description: "",
    curatorNote: "",
    visibility: "public",
    publishedAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z",
    unpublishedAt: null,
    itemCount: 4,
    followerCount: 0,
    ...overrides,
  };
}

const base = { sections: DEFAULT_SECTION_SWITCHES };

test("the load-bearing test: a visitor view never carries profile.id, timestamps, or any inner id", () => {
  const view = deriveProfileView(profile(), [pub()], ANON, base);
  assert.equal(Object.hasOwn(view, "id"), false);
  assert.equal(Object.hasOwn(view, "createdAt"), false);
  assert.equal(Object.hasOwn(view, "updatedAt"), false);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes(PROFILE_ID), false);
  assert.equal(serialized.includes("pub-1"), false);
});

test("an owner view also omits id and timestamps", () => {
  const view = deriveProfileView(profile(), [], OWNER, base);
  assert.equal(Object.hasOwn(view, "id"), false);
  assert.equal(Object.hasOwn(view, "createdAt"), false);
  assert.equal(Object.hasOwn(view, "updatedAt"), false);
});

test("the view exposes exactly the public fields", () => {
  const view = deriveProfileView(profile(), [], ANON, base);
  assert.deepEqual(Object.keys(view).sort(), [
    "avatarUrl",
    "bio",
    "collections",
    "coverUrl",
    "displayName",
    "figures",
    "handle",
    "isOwner",
    "links",
    "location",
    "visibleSections",
  ]);
});

// ── collections: the isListable gate ────────────────────────────────────────

test("a visitor sees only live public collections", () => {
  const view = deriveProfileView(
    profile(),
    [
      pub({ slug: "public-live", visibility: "public" }),
      pub({ slug: "followers-live", visibility: "followers" }),
      pub({ slug: "unlisted-live", visibility: "unlisted" }),
      pub({ slug: "public-down", visibility: "public", unpublishedAt: "2026-04-04T00:00:00.000Z" }),
    ],
    ANON,
    base
  );
  assert.deepEqual(view.collections.map((card) => card.slug), ["public-live"]);
  assert.equal(view.collections[0].isUnpublished, false);
});

test("a follower additionally sees followers-tier collections, still not unlisted", () => {
  const view = deriveProfileView(
    profile(),
    [
      pub({ slug: "public-live", visibility: "public" }),
      pub({ slug: "followers-live", visibility: "followers" }),
      pub({ slug: "unlisted-live", visibility: "unlisted" }),
    ],
    FOLLOWER,
    base
  );
  assert.deepEqual(view.collections.map((card) => card.slug).sort(), ["followers-live", "public-live"]);
});

test("a signed-in non-follower sees the same as an anonymous visitor", () => {
  const publications = [
    pub({ slug: "public-live", visibility: "public" }),
    pub({ slug: "followers-live", visibility: "followers" }),
  ];
  const signedIn = deriveProfileView(profile(), publications, SIGNED_IN, base);
  assert.deepEqual(signedIn.collections.map((card) => card.slug), ["public-live"]);
});

test("an owner sees unlisted and unpublished collections, with the down one flagged", () => {
  const view = deriveProfileView(
    profile(),
    [
      pub({ slug: "public-live", visibility: "public" }),
      pub({ slug: "unlisted-live", visibility: "unlisted" }),
      pub({ slug: "private-live", visibility: "private" }),
      pub({ slug: "public-down", visibility: "public", unpublishedAt: "2026-04-04T00:00:00.000Z" }),
    ],
    OWNER,
    base
  );
  assert.deepEqual(
    view.collections.map((card) => card.slug).sort(),
    ["private-live", "public-down", "public-live", "unlisted-live"]
  );
  const down = view.collections.find((card) => card.slug === "public-down");
  assert.equal(down.isUnpublished, true);
});

test("figures.collections always equals the number of cards that crossed", () => {
  const publications = [
    pub({ slug: "a", visibility: "public" }),
    pub({ slug: "b", visibility: "unlisted" }),
    pub({ slug: "c", visibility: "public", unpublishedAt: "2026-04-04T00:00:00.000Z" }),
  ];
  const visitor = deriveProfileView(profile(), publications, ANON, base);
  assert.equal(visitor.figures.collections, visitor.collections.length);
  assert.equal(visitor.figures.collections, 1);
  const owner = deriveProfileView(profile(), publications, OWNER, base);
  assert.equal(owner.figures.collections, owner.collections.length);
  assert.equal(owner.figures.collections, 3);
});

// ── figures: followers / following ─────────────────────────────────────────

test("followers/following come from options and never go negative", () => {
  const view = deriveProfileView(profile(), [], ANON, { ...base, followers: 12, following: -3 });
  assert.equal(view.figures.followers, 12);
  assert.equal(view.figures.following, 0);
});

test("followers is not summed from collections — it defaults to 0", () => {
  const view = deriveProfileView(
    profile(),
    [pub({ slug: "a", followerCount: 5 }), pub({ slug: "b", followerCount: 3 })],
    OWNER,
    base
  );
  assert.equal(view.figures.followers, 0);
});

// ── visibleSections ────────────────────────────────────────────────────────

test("a non-owner never sees a hidden:true section; a switched-off one is absent", () => {
  const sections = { ...DEFAULT_SECTION_SWITCHES, showFollowers: false };
  const view = deriveProfileView(profile({ sections }), [], SIGNED_IN, { sections });
  assert.equal(Object.hasOwn(view.visibleSections, "followers"), false);
  for (const section of Object.values(view.visibleSections)) {
    assert.equal(section.hidden, false);
  }
});

test("an owner sees every section, flagged hidden where the switch is off", () => {
  const sections = { ...DEFAULT_SECTION_SWITCHES, showFollowers: false, showLikes: false };
  const view = deriveProfileView(profile({ sections }), [], OWNER, { sections });
  assert.equal(view.visibleSections.followers.hidden, true);
  assert.equal(view.visibleSections.likes.hidden, true);
  assert.equal(view.visibleSections.following.hidden, false);
});

// ── ordering ───────────────────────────────────────────────────────────────

test("pinned collections sort first, in the owner's declared order", () => {
  const view = deriveProfileView(
    profile({ pinnedCollectionSlugs: ["third", "first"] }),
    [pub({ slug: "first" }), pub({ slug: "second" }), pub({ slug: "third" })],
    OWNER,
    base
  );
  assert.deepEqual(view.collections.map((card) => card.slug), ["third", "first", "second"]);
  assert.deepEqual(view.collections.map((card) => card.isPinned), [true, true, false]);
});