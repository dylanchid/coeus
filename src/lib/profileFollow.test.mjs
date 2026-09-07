import assert from "node:assert/strict";
import test from "node:test";

import { parseProfileFollowRequest } from "./profileFollow.ts";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";

test("parseProfileFollowRequest accepts a lone uuid profileId", () => {
  const parsed = parseProfileFollowRequest({ profileId: PROFILE_ID });
  assert.deepEqual(parsed, { ok: true, value: { profileId: PROFILE_ID } });
});

test("parseProfileFollowRequest rejects a non-object body", () => {
  for (const raw of [null, undefined, "x", 3, [], [PROFILE_ID]]) {
    const parsed = parseProfileFollowRequest(raw);
    assert.equal(parsed.ok, false);
  }
});

test("parseProfileFollowRequest rejects a non-uuid profileId", () => {
  for (const profileId of ["not-a-uuid", "", 42, PROFILE_ID.slice(0, -1)]) {
    const parsed = parseProfileFollowRequest({ profileId });
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /UUID/);
  }
});

test("parseProfileFollowRequest rejects unknown fields", () => {
  const parsed = parseProfileFollowRequest({ profileId: PROFILE_ID, extra: 1 });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unknown field: extra/);
});
