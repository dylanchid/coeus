import assert from "node:assert/strict";
import test from "node:test";

import { isOutboundUrlAllowed } from "./safeOutboundFetch.server.ts";

const publicIpv4 = async () => [{ address: "93.184.216.34", family: 4 }];

test("isOutboundUrlAllowed rejects plain HTTP to loopback, localhost, and private hosts", async () => {
  assert.equal(await isOutboundUrlAllowed("http://127.0.0.1/secret"), false);
  assert.equal(await isOutboundUrlAllowed("http://10.0.0.1/secret"), false);
  assert.equal(await isOutboundUrlAllowed("http://[::1]/secret"), false);
  assert.equal(
    await isOutboundUrlAllowed("http://localhost/secret", async () => [{ address: "127.0.0.1", family: 4 }]),
    false,
  );
});

test("isOutboundUrlAllowed still allows public HTTPS URLs", async () => {
  assert.equal(await isOutboundUrlAllowed("https://example.com/article", publicIpv4), true);
});