import assert from "node:assert/strict";
import test from "node:test";

import { isOutboundUrlAllowed, isUnsafeIp } from "./safeOutboundFetch.server.ts";

const publicIpv4 = async () => [{ address: "93.184.216.34", family: 4 }];
const publicIpv6 = async () => [{ address: "2001:4860:4860::8888", family: 6 }];

test("isUnsafeIp flags private IPv4 and loopback", () => {
  assert.equal(isUnsafeIp("127.0.0.1"), true);
  assert.equal(isUnsafeIp("10.0.0.1"), true);
  assert.equal(isUnsafeIp("192.168.1.1"), true);
  assert.equal(isUnsafeIp("93.184.216.34"), false);
});

test("isUnsafeIp flags private and loopback IPv6", () => {
  assert.equal(isUnsafeIp("::1"), true);
  assert.equal(isUnsafeIp("fc00::1"), true);
  assert.equal(isUnsafeIp("fe80::1"), true);
  assert.equal(isUnsafeIp("2001:4860:4860::8888"), false);
});

test("isOutboundUrlAllowed rejects plain HTTP to loopback, localhost, and private hosts", async () => {
  assert.equal(await isOutboundUrlAllowed("http://127.0.0.1/secret"), false);
  assert.equal(await isOutboundUrlAllowed("http://10.0.0.1/secret"), false);
  assert.equal(await isOutboundUrlAllowed("http://[::1]/secret"), false);
  assert.equal(
    await isOutboundUrlAllowed("http://localhost/secret", async () => [{ address: "127.0.0.1", family: 4 }]),
    false,
  );
  assert.equal(await isOutboundUrlAllowed("http://169.254.169.254/latest/meta-data"), false);
});

test("isOutboundUrlAllowed allows public IPv4 and IPv6 over HTTPS", async () => {
  assert.equal(await isOutboundUrlAllowed("https://example.com/article", publicIpv4), true);
  assert.equal(await isOutboundUrlAllowed("https://example.com/article", publicIpv6), true);
  assert.equal(await isOutboundUrlAllowed("https://[2001:4860:4860::8888]/article"), true);
});

test("isOutboundUrlAllowed rejects non-http(s) schemes and credential-bearing URLs", async () => {
  assert.equal(await isOutboundUrlAllowed("ftp://example.com/file", publicIpv4), false);
  assert.equal(await isOutboundUrlAllowed("file:///etc/passwd"), false);
  assert.equal(await isOutboundUrlAllowed("https://user:pass@example.com/x", publicIpv4), false);
});

test("isOutboundUrlAllowed accepts ports on public hosts", async () => {
  assert.equal(await isOutboundUrlAllowed("https://example.com:8443/path", publicIpv4), true);
});