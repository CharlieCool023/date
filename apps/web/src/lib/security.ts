import { createHmac } from "node:crypto";
import { parseAesKey } from "@velum/crypto";

export function getEncryptionKey(): Buffer {
  const value = process.env.LOCAL_DEV_MASTER_KEY;
  if (!value) throw new Error("LOCAL_DEV_MASTER_KEY is required");
  return parseAesKey(value);
}

export function getBlindIndexKey(): string {
  const value = process.env.BLIND_INDEX_KEY;
  if (!value || value.length < 32) throw new Error("BLIND_INDEX_KEY must be at least 32 characters");
  return value;
}

export function isFounderEmail(email: string): boolean {
  const configured = process.env.ADMIN_EMAILS ?? "";
  const emails = configured.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return emails.includes(email.trim().toLowerCase());
}

export function anonymousRateLimitKey(request: Request, bucket: string): string {
  const address = request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be configured");
  const digest = createHmac("sha256", secret).update(address).digest("hex");
  return `rate:${bucket}:${digest}`;
}

export function sessionCookie(token: string): string {
  return `velum_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function clearSessionCookie(): string {
  return "velum_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
