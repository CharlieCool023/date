import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { hashToken } from "@velum/crypto";
import { clearSessionCookie } from "@/lib/security";
import { sessionTokenFromRequest } from "@/lib/auth";

export async function POST(request: Request) {
  const token = sessionTokenFromRequest(request);
  if (token) await db.delete(schema.authSessions).where(eq(schema.authSessions.tokenHash, hashToken(token)));
  return Response.json({ status: "signed_out" }, { headers: { "set-cookie": clearSessionCookie() } });
}
