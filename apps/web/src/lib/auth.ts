import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { hashToken } from "@velum/crypto";

function readCookie(header: string | null, name: string): string | null {
  const item = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function sessionTokenFromRequest(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), "velum_session");
}

export async function authenticatedUserId(request: Request): Promise<string | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  const [session] = await db.select({ userId: schema.authSessions.userId })
    .from(schema.authSessions)
    .where(and(eq(schema.authSessions.tokenHash, hashToken(token)), gt(schema.authSessions.expiresAt, new Date())))
    .limit(1);
  return session?.userId ?? null;
}
