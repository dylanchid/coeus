import assert from "node:assert/strict";
import test from "node:test";

import { deriveProfileView } from "./publicProfile.ts";

function profile(overrides = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "ada",
    displayName: "Ada Lovelace",
    bio: "Countess of computing",
    location: "London",
    links: [{ label: "Site", url: "https://ada.example" }],
    avatarUrl: null,
    coverUrl: null,
    pinnedCollectionSlugs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-02T00:00:00.000Z",
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

test("the load-bearing test: a visitor view never carries profile.id or timestamps", () => {
  const view = deriveProfileView(profile(), [], { isOwner: false });
  assert.equal(Object.hasOwn(view, "id"), false);
  assert.equal(Object.hasOwn(view, "createdAt"), false);
  assert.equal(Object.hasOwn(view, "updatedAt"), false);
  // and the account uuid appears nowhere in the serialized view
  assert.equal(JSON.stringify(view).includes("00000000-0000-0000-0000-000000000001"), false);
});

test("an owner view also omits id and timestamps", () => {
  const view = deriveProfileView(profile(), [], { isOwner: true });
  assert.equal(Object.hasOwn(view, "id"), false);
  assert.equal(Object.hasOwn(view, "createdAt"), false);
  assert.equal(Object.hasOwn(view, "updatedAt"), false);
});

test("a visitor sees only live public collections", () => {
  const view = deriveProfileView(
    profile(),
    [
      pub({ slug: "public-live", visibility: "public" }),
      pub({ slug: "unlisted-live", visibility: "unlisted" }),
      pub({ slug: "public-down", visibility: "public", unpublishedAt: "2026-04-04T00:00:00.000Z" }),
    ],
    { isOwner: false }
  );
  assert.deepEqual(view.collections.map((card) => card.slug), ["public-live"]);
  assert.equal(view.collections[0].isUnpublished, false);
});

test("an owner sees unlisted and unpublished collections, with the down one flagged", () => {
  const view = deriveProfileView(
    profile(),
    [
      pub({ slug: "public-live", visibility: "public" }),
      pub({ slug: "unlisted-live", visibility: "unlisted" }),
      pub({ slug: "public-down", visibility: "public", unpublishedAt: "2026-04-04T00:00:00.000Z" }),
    ],
    { isOwner: true }
  );
  assert.deepEqual(view.collections.map((card) => card.slug).sort(), ["public-down", "public-live", "unlisted-live"]);
  const down = view.collections.find((card) => card.slug === "public-down");
  assert.equal(down.isUnpublished, true);
});

test("figures.collections always equals the number of cards that crossed", () => {
  const publications = [
    pub({ slug: "a", visibility: "public" }),
    pub({ slug: "b", visibility: "unlisted" }),
    pub({ slug: "c", visibility: "public", unpublishedAt: "2026-04-04T00:00:00.000Z" }),
  ];
  const visitor = deriveProfileView(profile(), publications, { isOwner: false });
  assert.equal(visitor.figures.collections, visitor.collections.length);
  assert.equal(visitor.figures.collections, 1);
  const owner = deriveProfileView(profile(), publications, { isOwner: true });
  assert.equal(owner.figures.collections, owner.collections.length);
  assert.equal(owner.figures.collections, 3);
});

test("posts is 0 in Phase 1; followers/following come from options and never go negative", () => {
  const view = deriveProfileView(profile(), [], { isOwner: false }, { followers: 12, following: -3 });
  assert.equal(view.figures.posts, 0);
  assert.equal(view.figures.followers, 12);
  assert.equal(view.figures.following, 0);
});

test("with no followers option, the figure sums live collections' follower counts", () => {
  const view = deriveProfileView(
    profile(),
    [
      pub({ slug: "a", followerCount: 5 }),
      pub({ slug: "b", followerCount: 3 }),
      pub({ slug: "c", followerCount: 99, unpublishedAt: "2026-04-04T00:00:00.000Z" }),
    ],
    { isOwner: true }
  );
  assert.equal(view.figures.followers, 8);
});

test("pinned collections sort first, in the owner's declared order", () => {
  const view = deriveProfileView(
    profile({ pinnedCollectionSlugs: ["third", "first"] }),
    [
      pub({ slug: "first" }),
      pub({ slug: "second" }),
      pub({ slug: "third" }),
    ],
    { isOwner: true }
  );
  assert.deepEqual(view.collections.map((card) => card.slug), ["third", "first", "second"]);
  assert.deepEqual(view.collections.map((card) => card.isPinned), [true, true, false]);
});

test("the view exposes exactly the public identity fields", () => {
  const view = deriveProfileView(profile(), [], { isOwner: false });
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
  ]);
});
