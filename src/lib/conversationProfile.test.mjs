import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveInteractionFeed,
  deriveReplyThreads,
  likesSurface,
} from "./conversationProfile.ts";
import { DEFAULT_SECTION_SWITCHES } from "./profileSections.ts";

const PROFILE_OWNER = { kind: "owner", id: "profile-owner" };
const ANON = { kind: "anonymous" };
const SIGNED_IN = { kind: "signed-in", id: "viewer-1" };
const FOLLOWS_PROFILE = { kind: "follower", id: "viewer-1" };

const TARGET_OWNER = "target-owner-9";
const followsNobody = () => false;
const followsTargetOwner = (id) => id === TARGET_OWNER;

function collectionTarget(overrides = {}) {
  return {
    kind: "collection",
    slug: "field-notes",
    name: "Field Notes",
    visibility: "public",
    ownerId: TARGET_OWNER,
    ownerHandle: "curator",
    ...overrides,
  };
}

function postTarget(overrides = {}) {
  return {
    kind: "post",
    title: "A clip",
    url: "https://example.com/clip",
    sourceName: "example.com",
    author: "",
    visibility: "public",
    ownerId: TARGET_OWNER,
    ownerHandle: "curator",
    ...overrides,
  };
}

// ── deriveInteractionFeed (likes / reposts) ────────────────────────────────

test("deriveInteractionFeed: a public target crosses to every viewer", () => {
  const rows = [{ createdAt: "2026-09-01T00:00:00Z", target: collectionTarget() }];
  for (const viewer of [ANON, SIGNED_IN, PROFILE_OWNER]) {
    assert.equal(deriveInteractionFeed(rows, viewer, followsNobody).length, 1, JSON.stringify(viewer));
  }
});

test("deriveInteractionFeed: the revocation case — a reposted collection gone private/unpublished drops out", () => {
  const stillPublic = [{ createdAt: "t", target: collectionTarget() }];
  const nowPrivate = [{ createdAt: "t", target: collectionTarget({ visibility: "private" }) }];
  const orphaned = [{ createdAt: "t", target: null }];

  // While public: visible to a stranger.
  assert.equal(deriveInteractionFeed(stillPublic, SIGNED_IN, followsNobody).length, 1);
  // Set private by its owner: gone for the stranger…
  assert.equal(deriveInteractionFeed(nowPrivate, SIGNED_IN, followsNobody).length, 0);
  assert.equal(deriveInteractionFeed(nowPrivate, ANON, followsNobody).length, 0);
  // …but the reposter still sees their own row.
  assert.equal(deriveInteractionFeed(nowPrivate, PROFILE_OWNER, followsNobody).length, 1);
  // A since-deleted target is gone for everyone, the reposter included.
  assert.equal(deriveInteractionFeed(orphaned, PROFILE_OWNER, () => true).length, 0);
});

test("deriveInteractionFeed: a followers-tier target needs a follow of the TARGET owner, not the profile", () => {
  const rows = [{ createdAt: "t", target: collectionTarget({ visibility: "followers" }) }];
  // The viewer follows the profile being viewed, but not the collection's owner.
  assert.equal(deriveInteractionFeed(rows, FOLLOWS_PROFILE, followsNobody).length, 0);
  // Now they follow the collection's owner too.
  assert.equal(deriveInteractionFeed(rows, FOLLOWS_PROFILE, followsTargetOwner).length, 1);
});

test("deriveInteractionFeed: a card carries the owner handle, never the owner id or a target uuid", () => {
  const rows = [{ createdAt: "t", target: collectionTarget() }, { createdAt: "t", target: postTarget() }];
  const cards = deriveInteractionFeed(rows, ANON, followsNobody);
  const serialized = JSON.stringify(cards);
  assert.equal(serialized.includes(TARGET_OWNER), false, "no owner id");
  assert.equal(serialized.includes("ownerId"), false);
  assert.ok(serialized.includes("curator"), "handle is fine");
});

// ── deriveReplyThreads ────────────────────────────────────────────────────

function reply(id, parentId, overrides = {}) {
  return {
    id,
    parentId,
    body: `body ${id}`,
    visibility: "public",
    createdAt: `2026-09-0${id}T00:00:00Z`,
    updatedAt: `2026-09-0${id}T00:00:00Z`,
    targetType: "collection",
    targetId: "col-1",
    target: collectionTarget(),
    parentAuthorHandle: null,
    ...overrides,
  };
}

test("deriveReplyThreads: a root renders with its target as context, responses one level in", () => {
  const threads = deriveReplyThreads(
    [reply(1, null), reply(3, 1), reply(2, 1)],
    ANON,
    followsNobody,
  );
  assert.equal(threads.length, 1);
  assert.equal(threads[0].reply.target.kind, "collection");
  assert.deepEqual(
    threads[0].responses.map((r) => r.id),
    [2, 3],
    "responses are oldest-first",
  );
  assert.equal(threads[0].responses[0].replyingTo, undefined, "a direct response has no replying-to lead");
});

test("deriveReplyThreads: a third-level reply flattens to level two with a replying-to handle", () => {
  const threads = deriveReplyThreads(
    [reply(1, null), reply(2, 1), reply(3, 2, { parentAuthorHandle: "mallory" })],
    ANON,
    followsNobody,
  );
  const flattened = threads[0].responses.find((r) => r.id === 3);
  assert.equal(flattened.replyingTo, "mallory");
  assert.equal(threads[0].responses.length, 2, "both level-2 and the flattened level-3 sit at the same level");
});

test("deriveReplyThreads: a response whose root is not in the set is dropped", () => {
  // reply 2's parent (id 1) is absent — it belongs to someone else's thread.
  const threads = deriveReplyThreads([reply(2, 1)], ANON, followsNobody);
  assert.deepEqual(threads, []);
});

test("deriveReplyThreads: a reply's own inherited tier gates it — a followers reply is invisible to a stranger", () => {
  const rows = [reply(1, null, { visibility: "followers", target: collectionTarget({ visibility: "followers" }) })];
  assert.equal(deriveReplyThreads(rows, SIGNED_IN, followsNobody).length, 0);
  assert.equal(deriveReplyThreads(rows, PROFILE_OWNER, followsNobody).length, 1, "the author still sees it");
});

test("deriveReplyThreads: edited is set when updatedAt moved", () => {
  const rows = [reply(1, null, { updatedAt: "2026-09-09T00:00:00Z" })];
  assert.equal(deriveReplyThreads(rows, ANON, followsNobody)[0].reply.edited, true);
});

// ── likesSurface ──────────────────────────────────────────────────────────

function switches(overrides = {}) {
  return { ...DEFAULT_SECTION_SWITCHES, ...overrides };
}

test("likesSurface: the owner always sees it, marked hidden when show_likes is off", () => {
  assert.deepEqual(likesSurface(switches(), PROFILE_OWNER), { render: true, hiddenForOwner: false });
  assert.deepEqual(likesSurface(switches({ showLikes: false }), PROFILE_OWNER), {
    render: true,
    hiddenForOwner: true,
  });
  assert.deepEqual(likesSurface(switches({ likesVisibility: "private" }), PROFILE_OWNER), {
    render: true,
    hiddenForOwner: false,
  });
});

test("likesSurface: a visitor needs BOTH the switch on and likes_visibility to admit them", () => {
  assert.equal(likesSurface(switches(), ANON).render, true, "public, switch on");
  assert.equal(likesSurface(switches({ showLikes: false }), ANON).render, false, "switch off");
  assert.equal(likesSurface(switches({ likesVisibility: "private" }), SIGNED_IN).render, false, "private tier");
  assert.equal(likesSurface(switches({ likesVisibility: "followers" }), SIGNED_IN).render, false, "not a follower");
  assert.equal(likesSurface(switches({ likesVisibility: "followers" }), FOLLOWS_PROFILE).render, true, "follower");
});
