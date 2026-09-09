import assert from "node:assert/strict";
import test from "node:test";

import { decideProxyRedirect } from "./proxyRedirect.ts";

test("signed-out visitor to /welcome is sent to /signin with a next param", () => {
  assert.deepEqual(decideProxyRedirect("/welcome", false), {
    pathname: "/signin",
    params: { next: "/welcome" },
  });
});

test("signed-in visitor to /signin is sent to /welcome with no params", () => {
  assert.deepEqual(decideProxyRedirect("/signin", true), { pathname: "/welcome" });
});

test("signed-in visitor to /welcome passes through", () => {
  assert.equal(decideProxyRedirect("/welcome", true), null);
});

test("signed-out visitor to /signin passes through", () => {
  assert.equal(decideProxyRedirect("/signin", false), null);
});

test("every other path passes through regardless of auth", () => {
  for (const signedIn of [true, false]) {
    for (const path of ["/", "/archive", "/u/alice", "/welcome/step-2", "/signin/callback"]) {
      assert.equal(decideProxyRedirect(path, signedIn), null, `${path} signedIn=${signedIn}`);
    }
  }
});
