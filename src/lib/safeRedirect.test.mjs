import assert from "node:assert/strict";
import test from "node:test";

import { safeInternalPath } from "./safeRedirect.ts";

test("keeps a plain rooted path, with query", () => {
  assert.equal(safeInternalPath("/archive", "/welcome"), "/archive");
  assert.equal(safeInternalPath("/archive?tab=notes&q=x", "/welcome"), "/archive?tab=notes&q=x");
  assert.equal(safeInternalPath("/u/ada/following", "/welcome"), "/u/ada/following");
});

test("falls back for empty / missing / non-string input", () => {
  assert.equal(safeInternalPath("", "/welcome"), "/welcome");
  assert.equal(safeInternalPath(null, "/welcome"), "/welcome");
  assert.equal(safeInternalPath(undefined, "/archive"), "/archive");
});

test("rejects the open-redirect vectors", () => {
  for (const vector of [
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "/\\\\evil.com",
    "https://evil.com",
    "http://evil.com",
    "javascript:alert(1)",
    "  /archive",
    "/foo\nSet-Cookie: x=1",
    "/foo\tbar",
    "/foo bar",
    "\\\\evil.com",
  ]) {
    assert.equal(safeInternalPath(vector, "/welcome"), "/welcome", `expected fallback for ${JSON.stringify(vector)}`);
  }
});

test("new URL(\"/\\evil.com\", origin) really does resolve cross-origin — the reason this helper exists", () => {
  assert.equal(new URL("/\\evil.com", "https://app.example.com").origin, "https://evil.com");
  // ...and the helper does not let that value through.
  assert.equal(safeInternalPath("/\\evil.com", "/welcome"), "/welcome");
});

test("a percent-encoded double slash stays a same-origin path, not a redirect", () => {
  // Encoded, it can only ever be a path on our origin; it never re-parses to an authority.
  assert.equal(safeInternalPath("/%2f%2fevil.com", "/welcome"), "/%2f%2fevil.com");
});
