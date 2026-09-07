import assert from "node:assert/strict";
import test from "node:test";

import { handleGetProfile, handlePatchProfileSections, handleSaveProfile } from "./profileApi.ts";
import {
  HandleChangeRateLimitedError,
  HandleQuarantinedError,
  HandleTakenError,
} from "./profileErrors.ts";

class MemoryProfileStore {
  profiles = new Map();
  takenHandles = new Set();
  quarantinedHandles = new Set();
  rateLimitedFrom = null; // Date the next handle change would be allowed
  failNext = null;

  async get(userId) {
    if (this.failNext === "get") { this.failNext = null; throw new Error("db down"); }
    return this.profiles.get(userId) ?? null;
  }

  async save(userId, input) {
    if (this.failNext === "save") { this.failNext = null; throw new Error("db down"); }
    const existing = this.profiles.get(userId);
    const handleChanged = existing != null && existing.handle !== input.handle;
    if (handleChanged && this.rateLimitedFrom) {
      throw new HandleChangeRateLimitedError(this.rateLimitedFrom);
    }
    if (this.takenHandles.has(input.handle) && existing?.handle !== input.handle) {
      throw new HandleTakenError("taken");
    }
    if (handleChanged && this.quarantinedHandles.has(input.handle)) {
      throw new HandleQuarantinedError("quarantined");
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

  sections = new Map();

  async updateSections(userId, patch) {
    if (this.failNext === "updateSections") { this.failNext = null; throw new Error("db down"); }
    if (!this.sections.has(userId)) return null; // no profile row yet
    const current = this.sections.get(userId);
    const next = {
      showFollowers: patch.showFollowers ?? current.showFollowers,
      showFollowing: patch.showFollowing ?? current.showFollowing,
      showReposts: patch.showReposts ?? current.showReposts,
      showReplies: patch.showReplies ?? current.showReplies,
      showLikes: patch.showLikes ?? current.showLikes,
      likesVisibility: patch.likesVisibility ?? current.likesVisibility,
    };
    this.sections.set(userId, next);
    return next;
  }
}

const DEFAULT_SECTIONS = {
  showFollowers: true,
  showFollowing: true,
  showReposts: true,
  showReplies: true,
  showLikes: true,
  likesVisibility: "public",
};

function patchSections(body) {
  return new Request("https://coeus.test/api/account/profile/sections", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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

test("PUT changing to a taken handle is 409 tagged to the handle field", async () => {
  const store = new MemoryProfileStore();
  await handleSaveProfile(put({ handle: "ada", displayName: "Ada" }), deps(store));
  store.takenHandles.add("grace");
  const response = await handleSaveProfile(put({ handle: "grace", displayName: "Ada" }), deps(store));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).field, "handle");
  assert.equal((await store.get("user-1")).handle, "ada", "the failed change left the handle untouched");
});

test("PUT changing to a handle quarantined by someone else is 409 with a distinct message", async () => {
  const store = new MemoryProfileStore();
  await handleSaveProfile(put({ handle: "ada", displayName: "Ada" }), deps(store));
  store.quarantinedHandles.add("grace");
  const response = await handleSaveProfile(put({ handle: "grace", displayName: "Ada" }), deps(store));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.field, "handle");
  assert.notEqual(body.error, "That handle is already taken.", "quarantine gets its own message");
});

test("PUT exceeding the handle-change rate limit is 429 with a Retry-After and retryAt", async () => {
  const store = new MemoryProfileStore();
  await handleSaveProfile(put({ handle: "ada", displayName: "Ada" }), deps(store));
  const nextAllowed = new Date(Date.now() + 60_000);
  store.rateLimitedFrom = nextAllowed;
  const response = await handleSaveProfile(put({ handle: "adanew", displayName: "Ada" }), deps(store));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) >= 1);
  const body = await response.json();
  assert.equal(body.field, "handle");
  assert.equal(body.retryAt, nextAllowed.toISOString());
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

// ── PATCH /api/account/profile/sections ─────────────────────────────────────

test("PATCH sections requires authentication", async () => {
  const response = await handlePatchProfileSections(patchSections({ showLikes: false }), deps(new MemoryProfileStore(), null));
  assert.equal(response.status, 401);
});

test("PATCH sections applies a partial update and echoes the new switches", async () => {
  const store = new MemoryProfileStore();
  store.sections.set("user-1", { ...DEFAULT_SECTIONS });

  const response = await handlePatchProfileSections(
    patchSections({ showReplies: false, likesVisibility: "followers" }),
    deps(store)
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json();
  assert.equal(body.sections.showReplies, false);
  assert.equal(body.sections.likesVisibility, "followers");
  assert.equal(body.sections.showLikes, true); // untouched
});

test("PATCH sections rejects an empty body with 400", async () => {
  const store = new MemoryProfileStore();
  store.sections.set("user-1", { ...DEFAULT_SECTIONS });
  const response = await handlePatchProfileSections(patchSections({}), deps(store));
  assert.equal(response.status, 400);
});

test("PATCH sections rejects an unknown key and likesVisibility of unlisted", async () => {
  const store = new MemoryProfileStore();
  store.sections.set("user-1", { ...DEFAULT_SECTIONS });

  const unknown = await handlePatchProfileSections(patchSections({ showComments: false }), deps(store));
  assert.equal(unknown.status, 400);

  const unlisted = await handlePatchProfileSections(patchSections({ likesVisibility: "unlisted" }), deps(store));
  assert.equal(unlisted.status, 400);

  const notBoolean = await handlePatchProfileSections(patchSections({ showLikes: "no" }), deps(store));
  assert.equal(notBoolean.status, 400);
});

test("PATCH sections is a 404 when the caller has not onboarded", async () => {
  const store = new MemoryProfileStore(); // no sections row for user-1
  const response = await handlePatchProfileSections(patchSections({ showLikes: false }), deps(store));
  assert.equal(response.status, 404);
});

test("PATCH sections maps a store failure to 503", async () => {
  const store = new MemoryProfileStore();
  store.sections.set("user-1", { ...DEFAULT_SECTIONS });
  store.failNext = "updateSections";
  const response = await handlePatchProfileSections(patchSections({ showLikes: false }), deps(store));
  assert.equal(response.status, 503);
});
