import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/** Decode the base64 DESTINATION_TOKEN_ENCRYPTION_KEY value into a raw AES-256 key. */
export function decodeEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(`DESTINATION_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes`);
  }
  return key;
}

/** Encrypt a third-party access token (or similar secret) for storage in destinations.secret_*. */
export function encryptSecret(plaintext: string, key: Buffer): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/** Decrypt a secret. Throws if the key is wrong or the ciphertext/tag was tampered with. */
export function decryptSecret(encrypted: EncryptedSecret, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
