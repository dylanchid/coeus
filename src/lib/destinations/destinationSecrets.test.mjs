import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { decodeEncryptionKey, decryptSecret, encryptSecret } from "./destinationSecrets.ts";

const KEY = randomBytes(32);

test("decodeEncryptionKey accepts a base64-encoded 32-byte key", () => {
  const key = decodeEncryptionKey(KEY.toString("base64"));
  assert.deepEqual(key, KEY);
});

test("decodeEncryptionKey rejects a key of the wrong length", () => {
  assert.throws(() => decodeEncryptionKey(Buffer.from("too-short").toString("base64")));
});

test("encrypt/decrypt round-trips a secret", () => {
  const encrypted = encryptSecret("ghp_supersecrettoken", KEY);
  assert.equal(decryptSecret(encrypted, KEY), "ghp_supersecrettoken");
});

test("decrypting with the wrong key fails", () => {
  const encrypted = encryptSecret("ghp_supersecrettoken", KEY);
  assert.throws(() => decryptSecret(encrypted, randomBytes(32)));
});

test("a tampered ciphertext byte fails authentication", () => {
  const encrypted = encryptSecret("ghp_supersecrettoken", KEY);
  const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
  tampered.ciphertext[0] ^= 0xff;
  assert.throws(() => decryptSecret(tampered, KEY));
});

test("a tampered auth tag fails authentication", () => {
  const encrypted = encryptSecret("ghp_supersecrettoken", KEY);
  const tampered = { ...encrypted, authTag: Buffer.from(encrypted.authTag) };
  tampered.authTag[0] ^= 0xff;
  assert.throws(() => decryptSecret(tampered, KEY));
});
