import assert from "node:assert/strict";
import test from "node:test";

import {
  handleDiscoverCollections,
  handleFollowCollection,
  handleListFollowed,
  handleListPublications,
  handlePublishCollection,
  handleUnfollowCollection,
  handleUnpublishCollection,
} from "./collectionPublicationApi.ts";
import { actorCanReachTarget } from "./conversation.ts";
import { CollectionForbiddenError, CollectionNotFoundError } from "./collectionPublicationErrors.ts";
import { filterFollowedCollections } from "./collectionPublication.ts";

const PUBLICATION_ID = "11111111-1111-1111-1111-111111111111";

class MemoryPublicationStore {
  publications = new Map();
  follows = new Map();
  /** `${followerId}:${ownerId}` keys — profile follows, used by the collection-follow vis cut. */
  profileFollows = new Set();
  failNext = { publish: null, unpublish: null, listPublic: null, follow: null, unfollow: null };

  async list(ownerId) {
    return [...this.publications.values()].filter((entry) => entry.ownerId === ownerId && !entry.unpublishedAt);
  }

  async publish(ownerId, request) {
    if (this.failNext.publish) throw this.consume("publish");
    const existing = this.publications.get(request.collectionLocalId);
    const publication = {
      id: existing?.id ?? globalThis.crypto.randomUUID(),
      archiveId: "archive-1",
      collectionLocalId: request.collectionLocalId,
      slug: existing?.slug ?? `${request.collectionLocalId}-slug`,
      visibility: request.visibility,
      name: existing?.name ?? "A collection",
      description: existing?.description ?? "",
      curatorNote: request.curatorNote,
      attribution: request.attribution,
      items: existing?.items ?? [],
      publishedAt: existing?.publishedAt ?? "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
      unpublishedAt: null,
      ownerId,
    };
    this.publications.set(request.collectionLocalId, publication);
    return publication;
  }

  async unpublish(_ownerId, collectionLocalId) {
    if (this.failNext.unpublish) throw this.consume("unpublish");
    const publication = this.publications.get(collectionLocalId);
    if (!publication || publication.unpublishedAt) return false;
    publication.unpublishedAt = "2026-09-04T00:00:00.000Z";
    return true;
  }

  async getBySlug(slug) {
    return [...this.publications.values()].find((entry) => entry.slug === slug && !entry.unpublishedAt) ?? null;
  }

  async listPublic(limit, offset) {
    if (this.failNext.listPublic) throw this.consume("listPublic");
    const all = [...this.publications.values()].filter((entry) => entry.visibility === "public" && !entry.unpublishedAt);
    const page = all.slice(offset, offset + limit);
    return {
      items: page.map((entry) => ({
        id: entry.id, slug: entry.slug, name: entry.name, description: entry.description,
        curatorNote: entry.curatorNote, attribution: entry.attribution,
        publishedAt: entry.publishedAt, updatedAt: entry.updatedAt, itemCount: entry.items.length,
      })),
      hasMore: offset + limit < all.length,
    };
  }

  async follow(followerId, publicationId) {
    if (this.failNext.follow) throw this.consume("follow");
    const publication = [...this.publications.values()].find((entry) => entry.id === publicationId);
    if (!publication || publication.unpublishedAt) throw new CollectionNotFoundError("Collection not found");
    const followsOwner = this.profileFollows.has(`${followerId}:${publication.ownerId}`);
    if (!actorCanReachTarget(publication, followerId, followsOwner)) {
      throw new CollectionForbiddenError("You cannot follow a collection you cannot see");
    }
    const set = this.follows.get(publicationId) ?? new Set();
    set.add(followerId);
    this.follows.set(publicationId, set);
  }

  async unfollow(followerId, publicationId) {
    if (this.failNext.unfollow) throw this.consume("unfollow");
    this.follows.get(publicationId)?.delete(followerId);
  }

  async listFollowed(followerId) {
    const live = [...this.publications.values()].filter(
      (entry) => this.follows.get(entry.id)?.has(followerId) && !entry.unpublishedAt,
    );
    const followedOwnerIds = new Set(
      [...this.profileFollows]
        .filter((key) => key.startsWith(`${followerId}:`))
        .map((key) => key.slice(followerId.length + 1)),
    );
    return filterFollowedCollections(live, followerId, followedOwnerIds);
  }

  consume(key) {
    const error = this.failNext[key];
    this.failNext[key] = null;
    return error;
  }
}

function dependencies(store, ownerId = "user-1") {
  return { authenticate: async () => ownerId, store };
}

function jsonRequest(url, body) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("handleListPublications requires authentication and returns the owner's publications", async () => {
  const store = new MemoryPublicationStore();
  await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });

  const unauthorized = await handleListPublications(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleListPublications(dependencies(store));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json();
  assert.equal(body.publications.length, 1);
  assert.equal(body.publications[0].collectionLocalId, "c1");
});

test("handlePublishCollection validates auth, JSON, and body shape before calling the store", async () => {
  const store = new MemoryPublicationStore();
  const request = () => jsonRequest("http://localhost/api/collections/publish", { collectionLocalId: "c1", visibility: "public" });

  const unauthorized = await handlePublishCollection(request(), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const malformed = await handlePublishCollection(
    new Request("http://localhost/api/collections/publish", { method: "POST", body: "{not json" }),
    dependencies(store)
  );
  assert.equal(malformed.status, 400);

  const invalidVisibility = await handlePublishCollection(
    jsonRequest("http://localhost/api/collections/publish", { collectionLocalId: "c1", visibility: "friends-only" }),
    dependencies(store)
  );
  assert.equal(invalidVisibility.status, 400);
});

test("handlePublishCollection publishes and returns 201 with the stored publication", async () => {
  const store = new MemoryPublicationStore();
  const response = await handlePublishCollection(
    jsonRequest("http://localhost/api/collections/publish", { collectionLocalId: "c1", visibility: "public", curatorNote: "Why it matters", attribution: "Curated by Me" }),
    dependencies(store)
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.collectionLocalId, "c1");
  assert.equal(body.curatorNote, "Why it matters");
});

test("handlePublishCollection maps CollectionNotFoundError to 404 and other failures to 503", async () => {
  const store = new MemoryPublicationStore();

  store.failNext.publish = new CollectionNotFoundError("Collection not found");
  const notFound = await handlePublishCollection(
    jsonRequest("http://localhost/api/collections/publish", { collectionLocalId: "missing", visibility: "public" }),
    dependencies(store)
  );
  assert.equal(notFound.status, 404);

  store.failNext.publish = new Error("boom");
  const failure = await handlePublishCollection(
    jsonRequest("http://localhost/api/collections/publish", { collectionLocalId: "c1", visibility: "public" }),
    dependencies(store)
  );
  assert.equal(failure.status, 503);
});

test("handleUnpublishCollection returns 404 when nothing was published, 204 on success", async () => {
  const store = new MemoryPublicationStore();
  const noop = await handleUnpublishCollection(
    jsonRequest("http://localhost/api/collections/unpublish", { collectionLocalId: "c1" }),
    dependencies(store)
  );
  assert.equal(noop.status, 404);

  await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });
  const success = await handleUnpublishCollection(
    jsonRequest("http://localhost/api/collections/unpublish", { collectionLocalId: "c1" }),
    dependencies(store)
  );
  assert.equal(success.status, 204);

  const alreadyGone = await handleUnpublishCollection(
    jsonRequest("http://localhost/api/collections/unpublish", { collectionLocalId: "c1" }),
    dependencies(store)
  );
  assert.equal(alreadyGone.status, 404, "unpublishing an already-unpublished collection is not currently published");
});

test("handleDiscoverCollections needs no authentication and serves public cache headers", async () => {
  const store = new MemoryPublicationStore();
  await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });
  await store.publish("user-1", { collectionLocalId: "c2", visibility: "unlisted", curatorNote: "", attribution: "" });

  const response = await handleDiscoverCollections(new Request("http://localhost/api/collections/discover"), { store });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  const body = await response.json();
  assert.equal(body.items.length, 1, "only public (not unlisted) collections are discoverable");
  assert.equal(body.items[0].slug, "c1-slug");
});

test("handleDiscoverCollections respects limit/offset and falls back on invalid values", async () => {
  const store = new MemoryPublicationStore();
  for (let index = 0; index < 3; index += 1) {
    await store.publish("user-1", { collectionLocalId: `c${index}`, visibility: "public", curatorNote: "", attribution: "" });
  }
  const paged = await handleDiscoverCollections(new Request("http://localhost/api/collections/discover?limit=2&offset=0"), { store });
  const pagedBody = await paged.json();
  assert.equal(pagedBody.items.length, 2);
  assert.equal(pagedBody.hasMore, true);

  const fallback = await handleDiscoverCollections(new Request("http://localhost/api/collections/discover?limit=not-a-number"), { store });
  assert.equal(fallback.status, 200);
});

test("handleDiscoverCollections returns 503 when the store fails", async () => {
  const store = new MemoryPublicationStore();
  store.failNext.listPublic = new Error("db unavailable");
  const response = await handleDiscoverCollections(new Request("http://localhost/api/collections/discover"), { store });
  assert.equal(response.status, 503);
});

test("handleFollowCollection requires auth, validates the publicationId, and follows", async () => {
  const store = new MemoryPublicationStore();
  const published = await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });

  const unauthorized = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: published.id }),
    dependencies(store, null)
  );
  assert.equal(unauthorized.status, 401);

  const invalidId = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: "not-a-uuid" }),
    dependencies(store)
  );
  assert.equal(invalidId.status, 400);

  const success = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: published.id }),
    dependencies(store, "follower-1")
  );
  assert.equal(success.status, 204);
  assert.ok(store.follows.get(published.id)?.has("follower-1"));
});

test("handleFollowCollection follows an unlisted collection by id", async () => {
  const store = new MemoryPublicationStore();
  const published = await store.publish("user-1", { collectionLocalId: "c1", visibility: "unlisted", curatorNote: "", attribution: "" });
  const response = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: published.id }),
    dependencies(store, "follower-1")
  );
  assert.equal(response.status, 204);
});

test("handleFollowCollection rejects a missing or unpublished collection with 404", async () => {
  const store = new MemoryPublicationStore();
  const missing = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: PUBLICATION_ID }),
    dependencies(store, "follower-1")
  );
  assert.equal(missing.status, 404);

  const published = await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });
  await store.unpublish("user-1", "c1");
  const unpublished = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: published.id }),
    dependencies(store, "follower-1")
  );
  assert.equal(unpublished.status, 404);
});

test("handleFollowCollection rejects a publication the actor cannot canSee with 403", async () => {
  const store = new MemoryPublicationStore();
  const privatePub = await store.publish("user-1", { collectionLocalId: "private", visibility: "private", curatorNote: "", attribution: "" });
  const followersPub = await store.publish("user-1", { collectionLocalId: "followers", visibility: "followers", curatorNote: "", attribution: "" });

  const privateDenied = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: privatePub.id }),
    dependencies(store, "follower-1")
  );
  assert.equal(privateDenied.status, 403);
  assert.equal(store.follows.get(privatePub.id)?.has("follower-1") ?? false, false);

  const followersDenied = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: followersPub.id }),
    dependencies(store, "follower-1")
  );
  assert.equal(followersDenied.status, 403);

  store.profileFollows.add("follower-1:user-1");
  const followersAllowed = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: followersPub.id }),
    dependencies(store, "follower-1")
  );
  assert.equal(followersAllowed.status, 204);
});

test("handleFollowCollection returns 503 when the store fails", async () => {
  const store = new MemoryPublicationStore();
  store.failNext.follow = new Error("boom");
  const response = await handleFollowCollection(
    jsonRequest("http://localhost/api/collections/follow", { publicationId: PUBLICATION_ID }),
    dependencies(store)
  );
  assert.equal(response.status, 503);
});

test("handleUnfollowCollection requires auth and unfollows", async () => {
  const store = new MemoryPublicationStore();
  store.follows.set(PUBLICATION_ID, new Set(["follower-1"]));

  const unauthorized = await handleUnfollowCollection(
    jsonRequest("http://localhost/api/collections/unfollow", { publicationId: PUBLICATION_ID }),
    dependencies(store, null)
  );
  assert.equal(unauthorized.status, 401);

  const success = await handleUnfollowCollection(
    jsonRequest("http://localhost/api/collections/unfollow", { publicationId: PUBLICATION_ID }),
    dependencies(store, "follower-1")
  );
  assert.equal(success.status, 204);
  assert.equal(store.follows.get(PUBLICATION_ID).has("follower-1"), false);
});

test("handleListFollowed requires auth and returns only the caller's followed publications", async () => {
  const store = new MemoryPublicationStore();
  const published = await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });
  await store.follow("follower-1", published.id);

  const unauthorized = await handleListFollowed(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const forFollower = await handleListFollowed(dependencies(store, "follower-1"));
  const followerBody = await forFollower.json();
  assert.equal(followerBody.publications.length, 1);

  const forStranger = await handleListFollowed(dependencies(store, "someone-else"));
  const strangerBody = await forStranger.json();
  assert.equal(strangerBody.publications.length, 0);
});

test("handleListFollowed omits a followed collection after revocation to private", async () => {
  const store = new MemoryPublicationStore();
  const published = await store.publish("user-1", { collectionLocalId: "c1", visibility: "public", curatorNote: "", attribution: "" });
  await store.follow("follower-1", published.id);

  published.visibility = "private";
  const afterPrivate = await handleListFollowed(dependencies(store, "follower-1"));
  assert.equal((await afterPrivate.json()).publications.length, 0, "private is invisible to a former follower");
});

test("handleListFollowed keeps unlisted and omits followers-tier unless the viewer follows the owner", async () => {
  const store = new MemoryPublicationStore();
  const unlisted = await store.publish("user-1", { collectionLocalId: "unlisted", visibility: "unlisted", curatorNote: "", attribution: "" });
  const followersOnly = await store.publish("user-1", { collectionLocalId: "followers", visibility: "public", curatorNote: "", attribution: "" });
  await store.follow("follower-1", unlisted.id);
  await store.follow("follower-1", followersOnly.id);
  followersOnly.visibility = "followers";

  const beforeProfileFollow = await handleListFollowed(dependencies(store, "follower-1"));
  const beforeBody = await beforeProfileFollow.json();
  assert.deepEqual(beforeBody.publications.map((entry) => entry.collectionLocalId), ["unlisted"]);

  store.profileFollows.add("follower-1:user-1");
  const afterProfileFollow = await handleListFollowed(dependencies(store, "follower-1"));
  const afterBody = await afterProfileFollow.json();
  assert.deepEqual(
    afterBody.publications.map((entry) => entry.collectionLocalId).sort(),
    ["followers", "unlisted"],
  );
});

test("handleListFollowed returns 503 when the store fails", async () => {
  const store = new MemoryPublicationStore();
  const original = store.listFollowed.bind(store);
  store.listFollowed = async () => { throw new Error("boom"); };
  const response = await handleListFollowed(dependencies(store));
  assert.equal(response.status, 503);
  store.listFollowed = original;
});
