import { and, eq, gt, isNull } from "drizzle-orm";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { recoveryRegistrationVerifySchema } from "@velum/contracts";
import { generateToken, hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sessionCookie } from "@/lib/security";
import { parseRegistrationResponse, webAuthnConfig } from "@/lib/webauthn";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;
const neutral = () => Response.json({ message: "This recovery link is not available." }, { status: 202 });

export async function POST(request: Request) {
  let input: unknown;
  try {
    if (!await allowRequest(request, "recovery-email-verify", 10, 600)) return neutral();
    input = await request.json();
  } catch {
    return neutral();
  }
  const parsed = recoveryRegistrationVerifySchema.safeParse(input);
  if (!parsed.success) return neutral();
  try {
    const { token, challengeId, response: rawResponse } = parsed.data;
    const now = new Date();
    const [challenge] = await db.select().from(schema.authChallenges).where(and(
      eq(schema.authChallenges.id, challengeId),
      eq(schema.authChallenges.purpose, "email_recovery"),
      gt(schema.authChallenges.expiresAt, now)
    )).limit(1);
    if (!challenge?.userId) return neutral();
    const [recovery] = await db.select().from(schema.recoveryRequests).where(and(
      eq(schema.recoveryRequests.userId, challenge.userId),
      eq(schema.recoveryRequests.tokenHash, hashToken(token)),
      isNull(schema.recoveryRequests.usedAt),
      gt(schema.recoveryRequests.eligibleAt, new Date(now.getTime() - 1000)),
      gt(schema.recoveryRequests.expiresAt, now)
    )).limit(1);
    if (!recovery || recovery.eligibleAt > now) return neutral();
    const webAuthn = webAuthnConfig();
    const verification = await verifyRegistrationResponse({
      response: parseRegistrationResponse(rawResponse),
      expectedChallenge: challenge.challenge,
      expectedOrigin: webAuthn.origin,
      expectedRPID: webAuthn.rpID,
      requireUserVerification: true
    });
    if (!verification.verified || !verification.registrationInfo) return neutral();

    const credential = verification.registrationInfo.credential;
    const sessionToken = generateToken();
    const completed = await db.transaction(async (tx) => {
      const [lockedChallenge] = await tx.select().from(schema.authChallenges)
        .where(and(
          eq(schema.authChallenges.id, challengeId),
          eq(schema.authChallenges.purpose, "email_recovery"),
          gt(schema.authChallenges.expiresAt, now)
        )).for("update");
      const [lockedRecovery] = await tx.select().from(schema.recoveryRequests)
        .where(and(
          eq(schema.recoveryRequests.id, recovery.id),
          eq(schema.recoveryRequests.tokenHash, hashToken(token)),
          isNull(schema.recoveryRequests.usedAt),
          gt(schema.recoveryRequests.expiresAt, now)
        )).for("update");
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, challenge.userId!)).for("update");
      if (!lockedChallenge || !lockedRecovery || !user || user.status === "deleted" || user.status === "suspended"
        || lockedRecovery.eligibleAt > now) return false;
      await tx.insert(schema.passkeys).values({
        credentialId: credential.id,
        userId: user.id,
        publicKey: Buffer.from(credential.publicKey),
        signCount: credential.counter,
        transports: credential.transports
      });
      await tx.update(schema.recoveryRequests).set({ usedAt: now })
        .where(eq(schema.recoveryRequests.id, lockedRecovery.id));
      await tx.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, user.id));
      await tx.update(schema.users).set({ recoveryCodesConfirmedAt: null })
        .where(eq(schema.users.id, user.id));
      await tx.delete(schema.authSessions).where(eq(schema.authSessions.userId, user.id));
      await tx.insert(schema.authSessions).values({
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS)
      });
      await tx.delete(schema.authChallenges).where(eq(schema.authChallenges.id, challengeId));
      await tx.insert(schema.emailOutbox).values({
        idempotencyKey: `security_alert:email_recovery:${lockedRecovery.id}`,
        userId: user.id,
        template: "security_alert",
        params: {}
      }).onConflictDoNothing();
      await tx.insert(schema.auditLog).values({
        actorId: user.id,
        action: "auth.recovery.email.completed",
        target: user.id,
        meta: {}
      });
      return true;
    });
    return completed
      ? Response.json({ status: "signed_in" }, { headers: { "set-cookie": sessionCookie(sessionToken) } })
      : neutral();
  } catch {
    logger.error({ operation: "auth.recovery.email.verify" }, "Passkey recovery failed");
    return neutral();
  }
}
