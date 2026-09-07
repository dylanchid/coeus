import assert from "node:assert/strict";
import test from "node:test";

import {
  handleFollowProfile,
  handleListFollowedProfiles,
  handleUnfollowProfile,
} from "./profileFollowApi.ts";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333";

class MemoryProfileFollowStore {
  // followerId -> Set<followeeId>, insertion order preserved for listFollowed
  edges = new Map();
  profiles = new Map([
    [BOB, { id: BOB, handle: "bob", displayName: "Bob", avatarUrl: null, bio: null }],
    [CAROL, { id: CAROL, handle: "carol", displayName: "Carol", avatarUrl: null, bio: "hi" }],
  ]);
  failNext = { follow: null, unfollow: null, listFollowed: null };

  async follow(followerId, followeeId) {
    if (this.failNext.follow) { this.failNext.follow = null; throw new Error("boom"); }
    const set = this.edges.get(followerId) ?? new Set();
    set.add(followeeId); // Set.add is idempotent — mirrors ON CONFLICT DO NOTHING
    this.edges.set(followerId, set);
  }

  async unfollow(followerId, followeeId) {
    if (this.failNext.unfollow) { this.failNext.unfollow = null; throw new Error("boom"); }
    this.edges.get(followerId)?.delete(followeeId);
  }

  async listFollowed(followerId) {
    if (this.failNext.listFollowed) { this.failNext.listFollowed = null; throw new Error("boom"); }
    return [...(this.edges.get(followerId) ?? [])]
      .reverse() // most-recently-followed first
      .map((id) => this.profiles.get(id))
      .filter(Boolean);
  }
}

function dependencies(store, followerId = ALICE) {
  return { authenticate: async () => followerId, store };
}

function jsonRequest(body) {
  return new Request("http://localhost/api/profiles/follow", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("handleFollowProfile requires auth, validates profileId, and follows", async () => {
  const store = new MemoryProfileFollowStore();

  const unauthorized = await handleFollowProfile(jsonRequest({ profileId: BOB }), dependencies(store, null));
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "Authentication required" });

  const invalid = await handleFollowProfile(jsonRequest({ profileId: "not-a-uuid" }), dependencies(store));
  assert.equal(invalid.status, 400);

  const ok = await handleFollowProfile(jsonRequest({ profileId: BOB }), dependencies(store));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.ok(store.edges.get(ALICE)?.has(BOB));
});

test("handleFollowProfile rejects invalid JSON with 400", async () => {
  const store = new MemoryProfileFollowStore();
  const request = new Request("http://localhost/api/profiles/follow", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not json",
  });
  const response = await handleFollowProfile(request, dependencies(store));
  assert.equal(response.status, 400);
});

test("handleFollowProfile is idempotent — following twice is not an error", async () => {
  const store = new MemoryProfileFollowStore();
  const first = await handleFollowProfile(jsonRequest({ profileId: BOB }), dependencies(store));
  const second = await handleFollowProfile(jsonRequest({ profileId: BOB }), dependencies(store));
  assert.equal(first.status, 204);
  assert.equal(second.status, 204);
  assert.equal(store.edges.get(ALICE).size, 1);
});

test("handleFollowProfile returns 422 on a self-follow, without touching the store", async () => {
  const store = new MemoryProfileFollowStore();
  const response = await handleFollowProfile(jsonRequest({ profileId: ALICE }), dependencies(store, ALICE));
  assert.equal(response.status, 422);
  assert.equal(store.edges.has(ALICE), false);
});

test("handleFollowProfile maps a store failure to 503", async () => {
  const store = new MemoryProfileFollowStore();
  store.failNext.follow = true;
  const response = await handleFollowProfile(jsonRequest({ profileId: BOB }), dependencies(store));
  assert.equal(response.status, 503);
});

test("handleUnfollowProfile requires auth and unfollows idempotently", async () => {
  const store = new MemoryProfileFollowStore();
  await store.follow(ALICE, BOB);

  const unauthorized = await handleUnfollowProfile(jsonRequest({ profileId: BOB }), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const ok = await handleUnfollowProfile(jsonRequest({ profileId: BOB }), dependencies(store));
  assert.equal(ok.status, 204);
  assert.equal(store.edges.get(ALICE).has(BOB), false);

  const again = await handleUnfollowProfile(jsonRequest({ profileId: BOB }), dependencies(store));
  assert.equal(again.status, 204);
});

test("handleListFollowedProfiles returns only the caller's follows, newest first, private/no-store", async () => {
  const store = new MemoryProfileFollowStore();
  await store.follow(ALICE, BOB);
  await store.follow(ALICE, CAROL);
  await store.follow(BOB, CAROL);

  const unauthorized = await handleListFollowedProfiles(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleListFollowedProfiles(dependencies(store));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json();
  assert.deepEqual(body.profiles.map((p) => p.handle), ["carol", "bob"]);

  const forBob = await handleListFollowedProfiles(dependencies(store, BOB));
  assert.deepEqual((await forBob.json()).profiles.map((p) => p.handle), ["carol"]);
});

test("handleListFollowedProfiles maps a store failure to 503", async () => {
  const store = new MemoryProfileFollowStore();
  store.failNext.listFollowed = true;
  const response = await handleListFollowedProfiles(dependencies(store));
  assert.equal(response.status, 503);
});
