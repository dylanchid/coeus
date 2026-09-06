import assert from "node:assert/strict";
import test from "node:test";

import { handleGetProfile, handleSaveProfile } from "./profileApi.ts";
import { HandleTakenError } from "./profileErrors.ts";

class MemoryProfileStore {
  profiles = new Map();
  takenHandles = new Set();
  failNext = null;

  async get(userId) {
    if (this.failNext === "get") { this.failNext = null; throw new Error("db down"); }
    return this.profiles.get(userId) ?? null;
  }

  async save(userId, input) {
    if (this.failNext === "save") { this.failNext = null; throw new Error("db down"); }
    const existing = this.profiles.get(userId);
    if (this.takenHandles.has(input.handle) && existing?.handle !== input.handle) {
      throw new HandleTakenError("taken");
    }
    const now = "2026-09-05T00:00:00.000Z";
    const profile = {
      id: userId,
      handle: input.handle,
      displayName: input.displayName,
      bio: input.bio,
      location: input.location ?? null,
      links: input.links ?? [],
      avatarUrl: input.avatarUrl ?? null,
      coverUrl: input.coverUrl ?? null,
      pinnedCollectionSlugs: input.pinnedCollectionSlugs ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.profiles.set(userId, profile);
    return profile;
  }
}

function deps(store, ownerId = "user-1") {
  return { authenticate: async () => ownerId, store };
}

function put(body) {
  return new Request("https://coeus.test/api/account/profile", { method: "PUT", body: JSON.stringify(body) });
}

test("GET requires authentication", async () => {
  const response = await handleGetProfile(deps(new MemoryProfileStore(), null));
  assert.equal(response.status, 401);
});

test("GET returns profile: null for a signed-in account that has not onboarded", async () => {
  const response = await handleGetProfile(deps(new MemoryProfileStore()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { profile: null });
});

test("PUT creates a profile and echoes the normalized value", async () => {
  const store = new MemoryProfileStore();
  const response = await handleSaveProfile(put({ handle: " Ada_L ", displayName: "  Ada  ", bio: "" }), deps(store));
  assert.equal(response.status, 200);
  const { profile } = await response.json();
  assert.equal(profile.handle, "ada_l");
  assert.equal(profile.displayName, "Ada");
  assert.equal(profile.bio, null);
  assert.equal((await store.get("user-1")).handle, "ada_l");
});

test("PUT round-trips: a GET afterwards returns the saved profile", async () => {
  const store = new MemoryProfileStore();
  await handleSaveProfile(put({ handle: "ada", displayName: "Ada" }), deps(store));
  const { profile } = await (await handleGetProfile(deps(store))).json();
  assert.equal(profile.handle, "ada");
});

test("PUT rejects invalid input with 422 and per-field messages", async () => {
  const response = await handleSaveProfile(put({ handle: "no", displayName: "" }), deps(new MemoryProfileStore()));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.ok(body.fields.handle);
  assert.ok(body.fields.displayName);
});

test("PUT persists the new surface fields and normalises links", async () => {
  const store = new MemoryProfileStore();
  const response = await handleSaveProfile(
    put({
      handle: "ada",
      displayName: "Ada",
      location: "  London  ",
      links: [{ label: "  Site  ", url: "  https://ada.example  " }],
      pinnedCollectionSlugs: ["notes", "Bad Slug", "notes"],
    }),
    deps(store)
  );
  assert.equal(response.status, 200);
  const { profile } = await response.json();
  assert.equal(profile.location, "London");
  assert.deepEqual(profile.links, [{ label: "Site", url: "https://ada.example" }]);
  assert.deepEqual(profile.pinnedCollectionSlugs, ["notes"]);
});

test("PUT rejects a malformed links array with 422 tagged to links", async () => {
  const response = await handleSaveProfile(
    put({ handle: "ada", displayName: "Ada", links: [{ label: "no url" }] }),
    deps(new MemoryProfileStore())
  );
  assert.equal(response.status, 422);
  assert.ok((await response.json()).fields.links);
});

test("PUT rejects an over-length location with 422 tagged to location", async () => {
  const response = await handleSaveProfile(
    put({ handle: "ada", displayName: "Ada", location: "x".repeat(81) }),
    deps(new MemoryProfileStore())
  );
  assert.equal(response.status, 422);
  assert.ok((await response.json()).fields.location);
});

test("PUT surfaces a taken handle as 409 tagged to the handle field", async () => {
  const store = new MemoryProfileStore();
  store.takenHandles.add("ada");
  const response = await handleSaveProfile(put({ handle: "ada", displayName: "Ada Impostor" }), deps(store));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).field, "handle");
});

test("PUT lets an existing owner keep their own handle", async () => {
  const store = new MemoryProfileStore();
  await handleSaveProfile(put({ handle: "ada", displayName: "Ada" }), deps(store));
  store.takenHandles.add("ada");
  const response = await handleSaveProfile(put({ handle: "ada", displayName: "Ada Lovelace" }), deps(store));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.displayName, "Ada Lovelace");
});

test("PUT rejects a malformed JSON body with 400", async () => {
  const request = new Request("https://coeus.test/api/account/profile", { method: "PUT", body: "{" });
  const response = await handleSaveProfile(request, deps(new MemoryProfileStore()));
  assert.equal(response.status, 400);
});

test("a store failure on save is a 503, not a crash", async () => {
  const store = new MemoryProfileStore();
  store.failNext = "save";
  const response = await handleSaveProfile(put({ handle: "ada", displayName: "Ada" }), deps(store));
  assert.equal(response.status, 503);
});
