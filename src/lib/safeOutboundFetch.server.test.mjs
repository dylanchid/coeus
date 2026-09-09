import assert from "node:assert/strict";
import test from "node:test";

// safeOutboundFetch.server.ts has no `import "server-only"` guard (see the
// server-only-vs-node-test convention): it is a pure address/URL validator with
// only node: built-in imports, so it runs directly under node --test.
import { isUnsafeIp, validatedHttpsUrl, UnsafeOutboundUrlError } from "./safeOutboundFetch.server.ts";

test("isUnsafeIp rejects the IPv4 private, loopback, link-local and special ranges", () => {
  for (const addr of [
    "0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.1.1", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "192.0.0.1", "192.0.2.5", "198.18.0.1", "203.0.113.7", "224.0.0.1", "100.64.0.1",
  ]) {
    assert.equal(isUnsafeIp(addr), true, `${addr} should be unsafe`);
  }
});

test("isUnsafeIp allows ordinary public IPv4", () => {
  for (const addr of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isUnsafeIp(addr), false, `${addr} should be allowed`);
  }
});

test("isUnsafeIp rejects IPv6 loopback, ULA, link-local, multicast, doc range", () => {
  for (const addr of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1"]) {
    assert.equal(isUnsafeIp(addr), true, `${addr} should be unsafe`);
  }
});

test("isUnsafeIp decodes IPv4-mapped / IPv4-compatible literals and applies the IPv4 rules", () => {
  assert.equal(isUnsafeIp("::ffff:7f00:1"), true, "::ffff:127.0.0.1");
  assert.equal(isUnsafeIp("::ffff:0a00:1"), true, "::ffff:10.0.0.1");
  assert.equal(isUnsafeIp("::ffff:0808:0808"), false, "::ffff:8.8.8.8 is public");
});

test("isUnsafeIp rejects NAT64 (64:ff9b::/96) that embeds a private/loopback IPv4 — F-30", () => {
  assert.equal(isUnsafeIp("64:ff9b::7f00:1"), true, "NAT64 -> 127.0.0.1");
  assert.equal(isUnsafeIp("64:ff9b::a00:1"), true, "NAT64 -> 10.0.0.1");
  assert.equal(isUnsafeIp("64:ff9b::c0a8:101"), true, "NAT64 -> 192.168.1.1");
  // NAT64 well-known prefix wrapping a public IPv4 stays allowed (the embedded
  // address is what matters).
  assert.equal(isUnsafeIp("64:ff9b::808:808"), false, "NAT64 -> 8.8.8.8");
});

test("isUnsafeIp rejects the whole NAT64 local-use prefix 64:ff9b:1::/48 — F-30", () => {
  assert.equal(isUnsafeIp("64:ff9b:1::1"), true);
  assert.equal(isUnsafeIp("64:ff9b:1:0:0:0:808:808"), true);
});

test("isUnsafeIp rejects 6to4 (2002::/16) that embeds a private/loopback IPv4 — F-30", () => {
  assert.equal(isUnsafeIp("2002:7f00:1::"), true, "6to4 -> 127.0.0.1");
  assert.equal(isUnsafeIp("2002:a00:1::1"), true, "6to4 -> 10.0.0.1");
  assert.equal(isUnsafeIp("2002:0808:0808::"), false, "6to4 -> 8.8.8.8 stays allowed");
});

test("isUnsafeIp rejects Teredo (2001::/32) whose server or client IPv4 is private/loopback — F-30", () => {
  assert.equal(isUnsafeIp("2001:0:7f00:1::"), true, "Teredo server -> 127.0.0.1");
  assert.equal(isUnsafeIp("2001:0:a00:1::"), true, "Teredo server -> 10.0.0.1");
  // Obfuscated client IPv4 lives in the last 32 bits, one's-complemented:
  // 10.0.0.1 -> ~ -> f5ff:fffe
  assert.equal(isUnsafeIp("2001:0:0808:0808:0:0:f5ff:fffe"), true, "Teredo client -> 10.0.0.1");
  // A public Teredo (server 8.8.8.8, client 1.1.1.1 -> fefe:fefe).
  assert.equal(isUnsafeIp("2001:0:0808:0808:0:0:fefe:fefe"), false, "public Teredo stays allowed");
});

test("isUnsafeIp allows ordinary public IPv6 (2001:db8 excepted, and non-transition 2001 ranges)", () => {
  for (const addr of ["2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4001::200e"]) {
    assert.equal(isUnsafeIp(addr), false, `${addr} should be allowed`);
  }
});

test("isUnsafeIp treats anything that is not a valid IP literal as unsafe", () => {
  for (const bad of ["", "not-an-ip", "999.1.1.1", "::gg", "1:2:3::4::5", "example.com"]) {
    assert.equal(isUnsafeIp(bad), true, `${bad} should be unsafe`);
  }
});

test("validatedHttpsUrl rejects non-HTTPS, credentialed, and invalid URLs", async () => {
  const publicResolve = async () => [{ address: "93.184.216.34", family: 4 }];
  await assert.rejects(validatedHttpsUrl("http://example.com", publicResolve), UnsafeOutboundUrlError);
  await assert.rejects(validatedHttpsUrl("https://user:pass@example.com", publicResolve), UnsafeOutboundUrlError);
  await assert.rejects(validatedHttpsUrl("not a url", publicResolve), UnsafeOutboundUrlError);
});

test("validatedHttpsUrl rejects when any resolved address is unsafe (one-good-one-bad)", async () => {
  const mixed = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "169.254.169.254", family: 4 },
  ];
  await assert.rejects(validatedHttpsUrl("https://example.com", mixed), UnsafeOutboundUrlError);
});

test("validatedHttpsUrl returns the first address for an all-public resolution", async () => {
  const publicResolve = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1::1", family: 6 },
  ];
  const { url, address, family } = await validatedHttpsUrl("https://example.com/feed", publicResolve);
  assert.equal(url.hostname, "example.com");
  assert.equal(address, "93.184.216.34");
  assert.equal(family, 4);
});

test("validatedHttpsUrl accepts an HTTPS URL whose host is already a public IP literal", async () => {
  const { address, family } = await validatedHttpsUrl("https://93.184.216.34/x", async () => {
    throw new Error("resolver should not be called for an IP literal");
  });
  assert.equal(address, "93.184.216.34");
  assert.equal(family, 4);
});
