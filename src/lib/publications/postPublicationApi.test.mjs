import assert from "node:assert/strict";
import test from "node:test";

import { handleListPosts, handlePublishPost, handleUnpublishPost } from "./postPublicationApi.ts";
import { PostItemNotFoundError } from "./postErrors.ts";

/**
 * A fake store standing in for SupabasePostPublicationStore. It models the two
 * things the handler contract cares about: an item the caller does not own
 * throws PostItemNotFoundError, and the client's payload can never set a post
 * field beyond itemLocalId / visibility / commentary.
 */
class MemoryPostStore {
  // ownerId -> Set<itemLocalId> the owner actually has in their archive
  archives = new Map([["owner-1", new Set(["item-1", "item-2"])]]);
  published = new Map(); // `${ownerId}:${itemLocalId}` -> Post
  failNext = null;

  async publish(ownerId, request) {
    if (this.failNext === "publish") { this.failNext = null; throw new Error("db down"); }
    if (!this.archives.get(ownerId)?.has(request.itemLocalId)) {
      throw new PostItemNotFoundError("Item not found");
    }
    // The server derives every content field from its own archive data.
    const post = {
      id: `post-${ownerId}-${request.itemLocalId}`,
      itemLocalId: request.itemLocalId,
      title: "Server-derived title",
      url: "https://example.com/derived",
      sourceName: "Derived Source",
      author: "Derived Author",
      excerpt: "derived excerpt",
      commentary: request.commentary,
      visibility: request.visibility,
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    };
    this.published.set(`${ownerId}:${request.itemLocalId}`, post);
    return post;
  }

  async unpublish(ownerId, itemLocalId) {
    if (this.failNext === "unpublish") { this.failNext = null; throw new Error("db down"); }
    return this.published.delete(`${ownerId}:${itemLocalId}`);
  }

  async listByAuthor(authorId) {
    if (this.failNext === "list") { this.failNext = null; throw new Error("db down"); }
    return [...this.published.entries()]
      .filter(([key]) => key.startsWith(`${authorId}:`))
      .map(([, value]) => ({
        itemLocalId: value.itemLocalId,
        title: value.title,
        url: value.url,
        sourceName: value.sourceName,
        author: value.author,
        excerpt: value.excerpt,
        commentary: value.commentary,
        visibility: value.visibility,
        publishedAt: value.createdAt,
        updatedAt: value.updatedAt,
      }));
  }
}

function deps(store, ownerId = "owner-1") {
  return { authenticate: async () => ownerId, store };
}

function post(url, body) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("handlePublishPost requires auth, validates the body, and returns 201 with the stored post", async () => {
  const store = new MemoryPostStore();

  const unauthorized = await handlePublishPost(
    post("http://localhost/api/posts/publish", { itemLocalId: "item-1", visibility: "public" }),
    deps(store, null)
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "Authentication required" });

  const badVisibility = await handlePublishPost(
    post("http://localhost/api/posts/publish", { itemLocalId: "item-1", visibility: "nope" }),
    deps(store)
  );
  assert.equal(badVisibility.status, 400);

  const ok = await handlePublishPost(
    post("http://localhost/api/posts/publish", { itemLocalId: "item-1", visibility: "followers", commentary: "read this" }),
    deps(store)
  );
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await ok.json();
  assert.equal(body.visibility, "followers");
  assert.equal(body.commentary, "read this");
  assert.equal(body.title, "Server-derived title");
});

test("handlePublishPost rejects invalid JSON with 400", async () => {
  const store = new MemoryPostStore();
  const request = new Request("http://localhost/api/posts/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not json",
  });
  assert.equal((await handlePublishPost(request, deps(store))).status, 400);
});

test("handlePublishPost cannot be steered past itemLocalId / visibility / commentary", async () => {
  const store = new MemoryPostStore();
  const response = await handlePublishPost(
    post("http://localhost/api/posts/publish", {
      itemLocalId: "item-1",
      visibility: "public",
      title: "MALICIOUS TITLE",
      url: "https://evil.example",
    }),
    deps(store)
  );
  // An extra field is a 400 — the client never sends post content.
  assert.equal(response.status, 400);
});

test("handlePublishPost returns 404, not 500, for an item the caller does not own", async () => {
  const store = new MemoryPostStore();
  const response = await handlePublishPost(
    post("http://localhost/api/posts/publish", { itemLocalId: "someone-elses-item", visibility: "public" }),
    deps(store)
  );
  assert.equal(response.status, 404);
});

test("handlePublishPost maps an unexpected store failure to 503", async () => {
  const store = new MemoryPostStore();
  store.failNext = "publish";
  const response = await handlePublishPost(
    post("http://localhost/api/posts/publish", { itemLocalId: "item-1", visibility: "public" }),
    deps(store)
  );
  assert.equal(response.status, 503);
});

test("handleUnpublishPost requires auth, 204 on success, 404 when nothing was published", async () => {
  const store = new MemoryPostStore();
  await store.publish("owner-1", { itemLocalId: "item-1", visibility: "public", commentary: "" });

  const unauthorized = await handleUnpublishPost(
    post("http://localhost/api/posts/unpublish", { itemLocalId: "item-1" }),
    deps(store, null)
  );
  assert.equal(unauthorized.status, 401);

  const ok = await handleUnpublishPost(
    post("http://localhost/api/posts/unpublish", { itemLocalId: "item-1" }),
    deps(store)
  );
  assert.equal(ok.status, 204);

  const gone = await handleUnpublishPost(
    post("http://localhost/api/posts/unpublish", { itemLocalId: "item-1" }),
    deps(store)
  );
  assert.equal(gone.status, 404);
});

test("handleUnpublishPost rejects an unknown field with 400", async () => {
  const store = new MemoryPostStore();
  const response = await handleUnpublishPost(
    post("http://localhost/api/posts/unpublish", { itemLocalId: "item-1", visibility: "public" }),
    deps(store)
  );
  assert.equal(response.status, 400);
});

test("handleListPosts requires auth, then returns the caller's own posts", async () => {
  const store = new MemoryPostStore();
  await store.publish("owner-1", { itemLocalId: "item-1", visibility: "followers", commentary: "note" });
  await store.publish("owner-1", { itemLocalId: "item-2", visibility: "public", commentary: "" });

  const unauthorized = await handleListPosts({ authenticate: async () => null, store });
  assert.equal(unauthorized.status, 401);

  const ok = await handleListPosts(deps(store));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.deepEqual(
    body.posts.map((p) => [p.itemLocalId, p.visibility]).sort(),
    [["item-1", "followers"], ["item-2", "public"]]
  );
});

test("handleListPosts maps a store failure to 503", async () => {
  const store = new MemoryPostStore();
  store.failNext = "list";
  const response = await handleListPosts(deps(store));
  assert.equal(response.status, 503);
});
