import assert from "node:assert/strict";
import test from "node:test";

import {
  actorCanReachTarget,
  isTargetType,
  parseCreateReplyRequest,
  parseTargetRefRequest,
  parseUpdateReplyRequest,
} from "./conversation.ts";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

test("isTargetType accepts the two enum members and nothing else", () => {
  assert.equal(isTargetType("collection"), true);
  assert.equal(isTargetType("post"), true);
  for (const value of ["archive", "reply", "", null, 1]) assert.equal(isTargetType(value), false);
});

// ── parseTargetRefRequest ──────────────────────────────────────────────────
test("parseTargetRefRequest: shape, enum and UUID rules", () => {
  assert.deepEqual(parseTargetRefRequest({ targetType: "post", targetId: UUID_A }), {
    ok: true,
    value: { targetType: "post", targetId: UUID_A },
  });
  assert.equal(parseTargetRefRequest("nope").ok, false);
  assert.equal(parseTargetRefRequest({ targetType: "archive", targetId: UUID_A }).ok, false);
  assert.equal(parseTargetRefRequest({ targetType: "post", targetId: "x" }).ok, false);
  assert.equal(parseTargetRefRequest({ targetType: "post", targetId: UUID_A, extra: 1 }).ok, false);
});

// ── parseCreateReplyRequest ────────────────────────────────────────────────
test("parseCreateReplyRequest: parentId is optional and nullable, body is bounded", () => {
  assert.deepEqual(
    parseCreateReplyRequest({ targetType: "collection", targetId: UUID_A, body: "hi" }),
    { ok: true, value: { targetType: "collection", targetId: UUID_A, parentId: null, body: "hi" } },
  );
  assert.deepEqual(
    parseCreateReplyRequest({ targetType: "collection", targetId: UUID_A, parentId: UUID_B, body: "hi" }).value.parentId,
    UUID_B,
  );
  assert.equal(parseCreateReplyRequest({ targetType: "post", targetId: UUID_A, parentId: "x", body: "hi" }).ok, false);
  assert.equal(parseCreateReplyRequest({ targetType: "post", targetId: UUID_A, body: "" }).ok, false);
  assert.equal(parseCreateReplyRequest({ targetType: "post", targetId: UUID_A, body: "   " }).ok, false);
  assert.equal(parseCreateReplyRequest({ targetType: "post", targetId: UUID_A, body: "x".repeat(4001) }).ok, false);
});

test("parseUpdateReplyRequest: only body, bounded", () => {
  assert.deepEqual(parseUpdateReplyRequest({ body: "edited" }), { ok: true, value: { body: "edited" } });
  assert.equal(parseUpdateReplyRequest({ body: "" }).ok, false);
  assert.equal(parseUpdateReplyRequest({ body: "ok", targetId: UUID_A }).ok, false);
});

// ── actorCanReachTarget — the write-time gate ──────────────────────────────
const OWNER_ID = "owner-9";

test("actorCanReachTarget: the target owner can always reach their own target", () => {
  for (const visibility of ["private", "followers", "unlisted", "public"]) {
    assert.equal(actorCanReachTarget({ visibility, ownerId: OWNER_ID }, OWNER_ID, false), true, visibility);
  }
});

test("actorCanReachTarget: a stranger reaches only unlisted and public targets", () => {
  const stranger = "actor-1";
  assert.equal(actorCanReachTarget({ visibility: "private", ownerId: OWNER_ID }, stranger, false), false);
  assert.equal(actorCanReachTarget({ visibility: "followers", ownerId: OWNER_ID }, stranger, false), false);
  assert.equal(actorCanReachTarget({ visibility: "unlisted", ownerId: OWNER_ID }, stranger, false), true);
  assert.equal(actorCanReachTarget({ visibility: "public", ownerId: OWNER_ID }, stranger, false), true);
});

test("actorCanReachTarget: following the target owner unlocks the followers tier, never private", () => {
  const follower = "actor-2";
  assert.equal(actorCanReachTarget({ visibility: "followers", ownerId: OWNER_ID }, follower, true), true);
  assert.equal(actorCanReachTarget({ visibility: "private", ownerId: OWNER_ID }, follower, true), false);
});
