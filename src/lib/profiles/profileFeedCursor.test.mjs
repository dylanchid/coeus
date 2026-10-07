import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeProfileFeedCursor,
  encodeProfileFeedCursor,
} from "./profileFeedCursor.ts";

/**
 * The keyset cursor for the profile Collections / Posts tabs. It must
 * round-trip an (ISO timestamp, id) pair through an opaque URL token, and a
 * malformed value must decode to null so a bad `?cursor=` falls back to the
 * first page rather than 404ing.
 */

test("round-trips a timestamp/id pair", () => {
  const cursor = { ts: "2026-03-04T05:06:07.891Z", id: "018f2c1a-1111-7abc-8def-000000000001" };
  const encoded = encodeProfileFeedCursor(cursor);
  assert.equal(typeof encoded, "string");
  assert.deepEqual(decodeProfileFeedCursor(encoded), cursor);
});

test("round-trips an id that is a slug rather than a uuid", () => {
  const cursor = { ts: "2026-01-01T00:00:00Z", id: "my-collection-slug" };
  assert.deepEqual(decodeProfileFeedCursor(encodeProfileFeedCursor(cursor)), cursor);
});

test("encodes null as null (no next page)", () => {
  assert.equal(encodeProfileFeedCursor(null), null);
});

test("takes the first value from a repeated query param", () => {
  const encoded = encodeProfileFeedCursor({ ts: "2026-01-01T00:00:00Z", id: "a" });
  assert.deepEqual(decodeProfileFeedCursor([encoded, "junk"]), { ts: "2026-01-01T00:00:00Z", id: "a" });
});

test("rejects malformed cursors", () => {
  for (const bad of [
    undefined,
    null,
    "",
    "not-base64!!",
    Buffer.from("no-separator", "utf8").toString("base64url"),
    Buffer.from("not-a-date|abc", "utf8").toString("base64url"),
    Buffer.from("|leading-separator", "utf8").toString("base64url"),
    Buffer.from("2026-01-01T00:00:00Z|", "utf8").toString("base64url"),
  ]) {
    assert.equal(decodeProfileFeedCursor(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});
