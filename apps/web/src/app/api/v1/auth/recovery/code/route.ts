import { and, eq, isNull } from "drizzle-orm";
import { recoveryCodeSchema } from "@velum/contracts";
import { constantTimeEqual, emailBlindIndex, generateToken, hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { getBlindIndexKey, sessionCookie } from "@/lib/security";
import { logger } from "@/lib/logger";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;
const neutral = () => Response.json({ message: "If the details are valid, sign in can continue." }, { status: 202 });

export async function POST(request: Request) {
  let body: unknown;
  try {
    if (!await allowRequest(request, "recovery-code", 5, 600)) return neutral();
    body = await request.json();
  } catch {
    return neutral();
  }
  const parsed = recoveryCodeSchema.safeParse(body);
  if (!parsed.success) return neutral();
  const recoveryKey = emailBlindIndex(parsed.data.email, getBlindIndexKey());
  const tokenHash = hashToken(parsed.data.code.toUpperCase());
  const sessionToken = generateToken();
  const now = new Date();
  try {
    const recovered = await db.transaction(async (tx) => {
      const [contact] = await tx.select({ userId: schema.userContacts.userId })
        .from(schema.userContacts).where(eq(schema.userContacts.emailBlindIndex, recoveryKey)).limit(1);
      if (!contact) return false;
      const codes = await tx.select().from(schema.recoveryCodes)
        .where(and(eq(schema.recoveryCodes.userId, contact.userId), isNull(schema.recoveryCodes.usedAt)))
        .for("update");
      const recovery = codes.find((candidate) => constantTimeEqual(candidate.codeHash, tokenHash));
      if (!recovery) return false;
      const [user] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, contact.userId)).for("update");
      if (!user || user.status === "deleted" || user.status === "suspended") return false;
      await tx.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, user.id));
      await tx.update(schema.users).set({ recoveryCodesConfirmedAt: null })
        .where(eq(schema.users.id, user.id));
      await tx.delete(schema.authSessions).where(eq(schema.authSessions.userId, user.id));
      await tx.insert(schema.authSessions).values({
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS)
      });
      await tx.insert(schema.emailOutbox).values({
        idempotencyKey: `security_alert:recovery:${recovery.id}:${user.id}`,
        userId: user.id,
        template: "security_alert",
        params: {}
      }).onConflictDoNothing();
      await tx.insert(schema.auditLog).values({
        actorId: user.id,
        action: "auth.recovery_code.used",
        target: user.id,
        meta: {}
      });
      return true;
    });
    return recovered
      ? Response.json({ status: "signed_in" }, { headers: { "set-cookie": sessionCookie(sessionToken) } })
      : neutral();
  } catch {
    logger.error({ operation: "auth.recovery.code" }, "Recovery code sign-in failed");
    return neutral();
  }
}
