import {
  createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual,
  publicEncrypt, constants
} from "node:crypto";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function parseAesKey(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength === 32) return decoded;
  const utf8 = Buffer.from(value, "utf8");
  if (utf8.byteLength === 32) return utf8;
  throw new Error("Encryption key must be 32 bytes or base64-encoded 32 bytes");
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailBlindIndex(email: string, key: string | Uint8Array): Buffer {
  return createHmac("sha256", key).update(normalizeEmail(email), "utf8").digest();
}

export function encrypt(plaintext: string, key: Uint8Array): Buffer {
  if (key.byteLength !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decrypt(envelope: Uint8Array, key: Uint8Array): string {
  if (key.byteLength !== 32) throw new Error("Encryption key must be 32 bytes");
  if (envelope.byteLength < IV_LENGTH + 16) throw new Error("Invalid encrypted payload");
  const data = Buffer.from(envelope);
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = data.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptForModeration(plaintext: string, publicKeyPem: string): Buffer {
  const key = randomBytes(32);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const wrappedKey = publicEncrypt({
    key: publicKeyPem,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256"
  }, key);
  return Buffer.from(JSON.stringify({
    version: 1,
    key: wrappedKey.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64")
  }), "utf8");
}
