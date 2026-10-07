import assert from "node:assert/strict";
import test from "node:test";

import { deriveThreadView } from "./threadPage.ts";

/**
 * The dedicated thread page's public-safe boundary (bareaga_web-kxe). It reuses
 * the canSeeIndirect gates from conversationProfile.ts, so the load-bearing
 * checks are: an invisible root collapses the whole page to null, and a
 * descendant whose tier the viewer cannot clear drops out of the list.
 */

const TARGET_OWNER = "target-owner";
const OWNER = { kind: "owner", id: "profile-owner" };
const ANON = { kind: "anonymous" };
const SIGNED_IN = { kind: "signed-in", id: "viewer-1" };
const FOLLOWS_TARGET = { kind: "follower", id: "viewer-1" };
const followsNobody = () => false;
const followsTarget = (id) => id === TARGET_OWNER;

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

function root(overrides = {}) {
  return {
    id: "root",
    parentId: null,
    body: "the opening reply",
    visibility: "public",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    targetType: "post",
    targetId: "p1",
    target: postTarget(),
    ...overrides,
  };
}

function descendant(id, overrides = {}) {
  return {
    id,
    parentId: "root",
    body: `reply ${id}`,
    visibility: "public",
    createdAt: `2026-09-02T00:00:0${id.slice(-1)}Z`,
    updatedAt: `2026-09-02T00:00:0${id.slice(-1)}Z`,
    targetType: "post",
    targetId: "p1",
    target: postTarget(),
    authorHandle: "someone",
    parentAuthorHandle: "profileowner",
    ...overrides,
  };
}

test("a visible public root with descendants renders the whole thread", () => {
  const view = deriveThreadView(root(), "profileowner", [descendant("d1"), descendant("d2")], ANON, followsNobody);
  assert.ok(view);
  assert.equal(view.root.authorHandle, "profileowner");
  assert.equal(view.root.target.kind, "post");
  assert.equal(view.replies.length, 2);
  assert.equal(view.replies[0].replyingTo, null, "a direct child of the root has no 'replying to' lead");
});

test("the revocation case — the root's target since made private collapses the page to null", () => {
  const privateTarget = root({ target: postTarget({ visibility: "private" }) });
  assert.equal(deriveThreadView(privateTarget, "profileowner", [descendant("d1")], ANON, followsNobody), null);
  assert.equal(deriveThreadView(privateTarget, "profileowner", [descendant("d1")], SIGNED_IN, followsNobody), null);
  // The target owner still sees a thread hanging off their own now-private post.
  assert.ok(deriveThreadView(privateTarget, "profileowner", [descendant("d1")], { kind: "owner", id: TARGET_OWNER }, followsNobody));
});

test("an orphaned root (target deleted) is null for everyone, owner included", () => {
  assert.equal(deriveThreadView(root({ target: null }), "profileowner", [], OWNER, followsNobody), null);
});

test("a followers-tier root is visible to a follower of the target owner, not to a stranger", () => {
  const followersRoot = root({ visibility: "followers", target: postTarget({ visibility: "followers" }) });
  assert.equal(deriveThreadView(followersRoot, "profileowner", [], SIGNED_IN, followsNobody), null);
  assert.ok(deriveThreadView(followersRoot, "profileowner", [], FOLLOWS_TARGET, followsTarget));
});

test("a private descendant under a public root drops out for a stranger but not the profile owner", () => {
  const rows = [descendant("d1"), descendant("d2", { visibility: "private" })];
  assert.equal(deriveThreadView(root(), "profileowner", rows, ANON, followsNobody).replies.length, 1);
  assert.equal(deriveThreadView(root(), "profileowner", rows, OWNER, followsNobody).replies.length, 2);
});

test("a deeper descendant keeps its parent's handle as the 'replying to' lead", () => {
  const deep = descendant("d3", { parentId: "d1", parentAuthorHandle: "someone" });
  const view = deriveThreadView(root(), "profileowner", [descendant("d1"), deep], ANON, followsNobody);
  assert.equal(view.replies.find((r) => r.id === "d3").replyingTo, "someone");
});

test("no owner id or target uuid crosses into the rendered cards", () => {
  const view = deriveThreadView(root(), "profileowner", [descendant("d1")], ANON, followsNobody);
  const json = JSON.stringify(view);
  assert.ok(!json.includes(TARGET_OWNER));
  assert.ok(!json.includes("p1"));
});
