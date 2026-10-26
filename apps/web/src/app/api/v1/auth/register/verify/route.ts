import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { registrationVerifySchema } from "@velum/contracts";
import { constantTimeEqual, decrypt, emailBlindIndex, generateToken, hashToken, normalizeEmail } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { getBlindIndexKey, getEncryptionKey, isFounderEmail, sessionCookie } from "@/lib/security";
import { logger } from "@/lib/logger";
import { parseRegistrationResponse, webAuthnConfig } from "@/lib/webauthn";

const neutral = () => Response.json({ message: "This invitation could not be used. Check the link and try again." }, { status: 202 });
const RECOVERY_CODE_COUNT = 10;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;

export async function POST(request: Request) {
  let input: unknown;
  try {
    if (!await allowRequest(request, "register-verify", 10, 600)) return neutral();
    input = await request.json();
  } catch {
    return Response.json({ message: "Registration is temporarily unavailable." }, { status: 503 });
  }
  const parsed = registrationVerifySchema.safeParse(input);
  if (!parsed.success) return neutral();

  try {
    const { challengeId, token, response: rawResponse } = parsed.data;
    const tokenHash = hashToken(token);
    const [challenge] = await db.select().from(schema.authChallenges)
      .where(and(
        eq(schema.authChallenges.id, challengeId),
        eq(schema.authChallenges.purpose, "registration"),
        gt(schema.authChallenges.expiresAt, new Date())
      )).limit(1);
    if (!challenge?.inviteId || !challenge.userId) return neutral();
    const [invite] = await db.select().from(schema.invites)
      .where(and(eq(schema.invites.id, challenge.inviteId), eq(schema.invites.tokenHash, tokenHash)))
      .limit(1);
    if (!invite || (invite.status !== "sent" && invite.status !== "opened") || invite.expiresAt <= new Date()) return neutral();
    const webAuthn = webAuthnConfig();
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: parseRegistrationResponse(rawResponse),
        expectedChallenge: challenge.challenge,
        expectedOrigin: webAuthn.origin,
        expectedRPID: webAuthn.rpID,
        requireUserVerification: true
      });
    } catch {
      return neutral();
    }
    if (!verification.verified || !verification.registrationInfo) return neutral();

    const credentials = verification.registrationInfo.credential;
    const key = getEncryptionKey();
    const blindKey = getBlindIndexKey();
    const sessionToken = generateToken();
    const now = new Date();
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(8).toString("hex").toUpperCase());
    const created = await db.transaction(async (tx) => {
      const [lockedChallenge] = await tx.select().from(schema.authChallenges)
        .where(and(eq(schema.authChallenges.id, challengeId), gt(schema.authChallenges.expiresAt, now)))
        .for("update");
      if (!lockedChallenge || lockedChallenge.purpose !== "registration" || lockedChallenge.inviteId !== invite.id
        || !lockedChallenge.userId) return false;
      const [lockedInvite] = await tx.select().from(schema.invites)
        .where(eq(schema.invites.id, invite.id)).for("update");
      if (!lockedInvite || lockedInvite.tokenHash === null || lockedInvite.expiresAt <= now
        || (lockedInvite.status !== "sent" && lockedInvite.status !== "opened")
        || !constantTimeEqual(lockedInvite.tokenHash, tokenHash)) return false;
      const email = normalizeEmail(decrypt(lockedInvite.emailCiphertext, key));
      const expectedBlindIndex = emailBlindIndex(email, blindKey);
      if (!constantTimeEqual(expectedBlindIndex, lockedInvite.inviteeEmailBlindIndex)) return false;
      const userId = lockedChallenge.userId;
      const founder = isFounderEmail(email);
      await tx.insert(schema.users).values({
        id: userId,
        status: "onboarding",
        role: founder ? "admin" : "member",
        invitedBy: lockedInvite.inviterId,
        zoneId: lockedInvite.zoneId
      });
      await tx.insert(schema.userContacts).values({
        userId,
        emailCiphertext: lockedInvite.emailCiphertext,
        emailBlindIndex: lockedInvite.inviteeEmailBlindIndex,
        verifiedAt: now
      });
      await tx.insert(schema.passkeys).values({
        credentialId: credentials.id,
        userId,
        publicKey: Buffer.from(credentials.publicKey),
        signCount: credentials.counter,
        transports: credentials.transports
      });
      await tx.insert(schema.recoveryCodes).values(recoveryCodes.map((code) => ({
        userId,
        codeHash: hashToken(code)
      })));
      await tx.insert(schema.authSessions).values({
        userId,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS)
      });
      await tx.update(schema.invites).set({ status: "redeemed", redeemedBy: userId }).where(eq(schema.invites.id, lockedInvite.id));
      await tx.delete(schema.authChallenges).where(eq(schema.authChallenges.id, challengeId));
      await tx.insert(schema.emailOutbox).values({
        idempotencyKey: `welcome:${userId}:${userId}`,
        userId,
        template: "welcome",
        params: {}
      }).onConflictDoNothing();
      if (founder) {
        await tx.insert(schema.auditLog).values({
          actorId: userId,
          action: "founder.admin_bootstrap",
          target: userId,
          meta: {}
        });
      }
      return true;
    });
    if (!created) return neutral();
    return Response.json({ status: "created", recoveryCodes }, { headers: { "set-cookie": sessionCookie(sessionToken) } });
  } catch {
    logger.error({ operation: "auth.register.verify" }, "Passkey registration failed");
    return Response.json({ message: "Registration is temporarily unavailable." }, { status: 503 });
  }
}
