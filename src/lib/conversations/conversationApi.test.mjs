import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCreateReply,
  handleDeleteReply,
  handleLike,
  handleRepost,
  handleUnlike,
  handleUnrepost,
  handleUpdateReply,
} from "./conversationApi.ts";
import { ParentReplyMismatchError, ReplyNotFoundError } from "./conversationErrors.ts";

const ACTOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PUBLIC_COLLECTION = "11111111-1111-1111-1111-111111111111";
const FOLLOWERS_POST = "22222222-2222-2222-2222-222222222222";
const PRIVATE_COLLECTION = "33333333-3333-3333-3333-333333333333";

class MemoryConversationStore {
  constructor() {
    this.targets = new Map([
      [`collection:${PUBLIC_COLLECTION}`, { visibility: "public", ownerId: OWNER }],
      [`post:${FOLLOWERS_POST}`, { visibility: "followers", ownerId: OWNER }],
      [`collection:${PRIVATE_COLLECTION}`, { visibility: "private", ownerId: OWNER }],
    ]);
    this.follows = new Set(); // `${actorId}->${ownerId}`
    this.likes = new Set();
    this.reposts = new Set();
    this.replies = new Map(); // id -> { authorId, targetType, targetId, parentId, body }
    this.replySeq = 0;
    this.fail = null;
  }

  async resolveTarget(targetType, targetId) {
    const t = this.targets.get(`${targetType}:${targetId}`);
    return t ? { targetType, targetId, ...t } : null;
  }

  async actorFollows(actorId, ownerId) {
    return this.follows.has(`${actorId}->${ownerId}`);
  }

  async like(actorId, ref) {
    if (this.fail === "like") throw new Error("boom");
    const key = `${actorId}:${ref.targetType}:${ref.targetId}`;
    const isNew = !this.likes.has(key);
    this.likes.add(key);
    return isNew;
  }

  async unlike(actorId, ref) {
    return this.likes.delete(`${actorId}:${ref.targetType}:${ref.targetId}`);
  }

  async repost(actorId, ref) {
    const key = `${actorId}:${ref.targetType}:${ref.targetId}`;
    const created = !this.reposts.has(key);
    this.reposts.add(key);
    return { repostId: `repost-${key}`, createdAt: "2026-09-06T00:00:00Z", created };
  }

  async unrepost(actorId, ref) {
    return this.reposts.delete(`${actorId}:${ref.targetType}:${ref.targetId}`);
  }

  async createReply(authorId, request) {
    if (request.parentId) {
      const parent = this.replies.get(request.parentId);
      if (!parent) throw new ReplyNotFoundError("Reply not found");
      if (parent.targetType !== request.targetType || parent.targetId !== request.targetId) {
        throw new ParentReplyMismatchError("Parent reply is on a different target");
      }
    }
    const id = `00000000-0000-4000-8000-${String(++this.replySeq).padStart(12, "0")}`;
    this.replies.set(id, { authorId, ...request });
    const target = this.targets.get(`${request.targetType}:${request.targetId}`);
    return { replyId: id, visibility: target.visibility, createdAt: "2026-09-06T00:00:00Z" };
  }

  async updateReply(authorId, replyId, body) {
    const reply = this.replies.get(replyId);
    if (!reply || reply.authorId !== authorId) throw new ReplyNotFoundError("Reply not found");
    reply.body = body;
  }

  async deleteReply(authorId, replyId) {
    const reply = this.replies.get(replyId);
    if (!reply || reply.authorId !== authorId) return false;
    this.replies.delete(replyId);
    return true;
  }
}

function deps(store, actorId = ACTOR) {
  return { authenticate: async () => actorId, store };
}

function req(body, method = "POST") {
  return new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ── likes ──────────────────────────────────────────────────────────────────
test("handleLike: 401 without auth, 400 on a bad body, 204 on success", async () => {
  const store = new MemoryConversationStore();
  assert.equal((await handleLike(req({ targetType: "collection", targetId: PUBLIC_COLLECTION }), deps(store, null))).status, 401);
  assert.equal((await handleLike(req({ targetType: "nope", targetId: PUBLIC_COLLECTION }), deps(store))).status, 400);

  const ok = await handleLike(req({ targetType: "collection", targetId: PUBLIC_COLLECTION }), deps(store));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.ok(store.likes.has(`${ACTOR}:collection:${PUBLIC_COLLECTION}`));
});

test("handleLike: a missing target is 404, an unseeable target is 403", async () => {
  const store = new MemoryConversationStore();
  const missing = await handleLike(req({ targetType: "post", targetId: PUBLIC_COLLECTION }), deps(store));
  assert.equal(missing.status, 404);

  const forbidden = await handleLike(req({ targetType: "collection", targetId: PRIVATE_COLLECTION }), deps(store));
  assert.equal(forbidden.status, 403);
  assert.equal(store.likes.size, 0, "no row is written when the gate fails");
});

test("handleLike: following the owner unlocks a followers-tier target", async () => {
  const store = new MemoryConversationStore();
  const before = await handleLike(req({ targetType: "post", targetId: FOLLOWERS_POST }), deps(store));
  assert.equal(before.status, 403);

  store.follows.add(`${ACTOR}->${OWNER}`);
  const after = await handleLike(req({ targetType: "post", targetId: FOLLOWERS_POST }), deps(store));
  assert.equal(after.status, 204);
});

test("handleUnlike: no can-see gate — you can always retract your own like", async () => {
  const store = new MemoryConversationStore();
  store.likes.add(`${ACTOR}:collection:${PRIVATE_COLLECTION}`);
  const ok = await handleUnlike(req({ targetType: "collection", targetId: PRIVATE_COLLECTION }, "DELETE"), deps(store));
  assert.equal(ok.status, 204);
  assert.equal(store.likes.size, 0);
});

// ── reposts ────────────────────────────────────────────────────────────────
test("handleRepost: 201 with the repost row; gate applies", async () => {
  const store = new MemoryConversationStore();
  const forbidden = await handleRepost(req({ targetType: "collection", targetId: PRIVATE_COLLECTION }), deps(store));
  assert.equal(forbidden.status, 403);

  const ok = await handleRepost(req({ targetType: "collection", targetId: PUBLIC_COLLECTION }), deps(store));
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), {
    repostId: `repost-${ACTOR}:collection:${PUBLIC_COLLECTION}`,
    createdAt: "2026-09-06T00:00:00Z",
    created: true,
  });

  const again = await handleRepost(req({ targetType: "collection", targetId: PUBLIC_COLLECTION }), deps(store));
  assert.equal((await again.json()).created, false, "a second repost is idempotent");
});

test("handleUnrepost: 204, no gate", async () => {
  const store = new MemoryConversationStore();
  store.reposts.add(`${ACTOR}:collection:${PRIVATE_COLLECTION}`);
  const ok = await handleUnrepost(req({ targetType: "collection", targetId: PRIVATE_COLLECTION }, "DELETE"), deps(store));
  assert.equal(ok.status, 204);
});

// ── replies ────────────────────────────────────────────────────────────────
test("handleCreateReply: gate applies, then 201 with the inherited visibility", async () => {
  const store = new MemoryConversationStore();
  const forbidden = await handleCreateReply(req({ targetType: "post", targetId: FOLLOWERS_POST, body: "hi" }), deps(store));
  assert.equal(forbidden.status, 403);

  store.follows.add(`${ACTOR}->${OWNER}`);
  const ok = await handleCreateReply(req({ targetType: "post", targetId: FOLLOWERS_POST, body: "hi" }), deps(store));
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).visibility, "followers", "the reply inherits the followers tier");
});

test("handleCreateReply: a parent on a different target is 422", async () => {
  const store = new MemoryConversationStore();
  store.follows.add(`${ACTOR}->${OWNER}`); // so the followers-post gate passes
  const parent = await handleCreateReply(
    req({ targetType: "collection", targetId: PUBLIC_COLLECTION, body: "root" }),
    deps(store),
  );
  const parentId = (await parent.json()).replyId;

  const mismatch = await handleCreateReply(
    req({ targetType: "post", targetId: FOLLOWERS_POST, parentId, body: "child" }),
    deps(store),
  );
  assert.equal(mismatch.status, 422);
});

test("handleUpdateReply / handleDeleteReply: author-scoped", async () => {
  const store = new MemoryConversationStore();
  const created = await handleCreateReply(
    req({ targetType: "collection", targetId: PUBLIC_COLLECTION, body: "mine" }),
    deps(store),
  );
  const replyId = (await created.json()).replyId;

  const notMine = await handleUpdateReply(replyId, req({ body: "hijack" }, "PATCH"), deps(store, OWNER));
  assert.equal(notMine.status, 404);

  const edit = await handleUpdateReply(replyId, req({ body: "edited" }, "PATCH"), deps(store));
  assert.equal(edit.status, 204);
  assert.equal(store.replies.get(replyId).body, "edited");

  const del = await handleDeleteReply(replyId, deps(store));
  assert.equal(del.status, 204);
  assert.equal(store.replies.has(replyId), false);
});

test("handleLike: a store failure surfaces as 503, not a throw", async () => {
  const store = new MemoryConversationStore();
  store.fail = "like";
  const res = await handleLike(req({ targetType: "collection", targetId: PUBLIC_COLLECTION }), deps(store));
  assert.equal(res.status, 503);
});
