import { and, eq, gt } from "drizzle-orm";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { authenticatorTransportSchema, authenticationVerifySchema } from "@velum/contracts";
import { generateToken, hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { parseAuthenticationResponse, webAuthnConfig } from "@/lib/webauthn";
import { sessionCookie } from "@/lib/security";

const neutral = () => Response.json({ message: "If your passkey is registered, continue to sign in." }, { status: 202 });
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;

export async function POST(request: Request) {
  try {
    if (!await allowRequest(request, "login-verify", 20, 600)) return neutral();
    const input: unknown = await request.json();
    const parsed = authenticationVerifySchema.safeParse(input);
    if (!parsed.success) return neutral();
    const { challengeId } = parsed.data;
    const [challenge] = await db.select().from(schema.authChallenges)
      .where(and(
        eq(schema.authChallenges.id, challengeId),
        eq(schema.authChallenges.purpose, "login"),
        gt(schema.authChallenges.expiresAt, new Date())
      )).limit(1);
    if (!challenge) return neutral();
    const credentialId = parsed.data.response.id;
    const [passkey] = await db.select().from(schema.passkeys)
      .where(eq(schema.passkeys.credentialId, credentialId)).limit(1);
    if (!passkey) {
      await db.delete(schema.authChallenges).where(eq(schema.authChallenges.id, challengeId));
      return neutral();
    }
    const credentialTransports = authenticatorTransportSchema.array().parse(passkey.transports ?? []);
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: parseAuthenticationResponse(parsed.data.response),
        expectedChallenge: challenge.challenge,
        expectedOrigin: webAuthnConfig().origin,
        expectedRPID: webAuthnConfig().rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.signCount,
          transports: credentialTransports
        },
        requireUserVerification: true
      });
    } catch {
      return neutral();
    }
    if (!verification.verified) return neutral();
    const [user] = await db.select({ status: schema.users.status })
      .from(schema.users).where(eq(schema.users.id, passkey.userId)).limit(1);
    if (!user || user.status === "deleted" || user.status === "suspended") return neutral();

    const sessionToken = generateToken();
    const now = new Date();
    const signedIn = await db.transaction(async (tx) => {
      const [lockedChallenge] = await tx.select({ id: schema.authChallenges.id })
        .from(schema.authChallenges)
        .where(and(eq(schema.authChallenges.id, challengeId), gt(schema.authChallenges.expiresAt, now)))
        .for("update");
      if (!lockedChallenge) return false;
      const [lockedPasskey] = await tx.select().from(schema.passkeys)
        .where(eq(schema.passkeys.credentialId, credentialId)).for("update");
      if (!lockedPasskey || lockedPasskey.userId !== passkey.userId) return false;
      await tx.update(schema.passkeys).set({
        signCount: verification.authenticationInfo.newCounter,
        lastUsedAt: now
      }).where(eq(schema.passkeys.credentialId, credentialId));
      await tx.delete(schema.authChallenges).where(eq(schema.authChallenges.id, challengeId));
      await tx.insert(schema.authSessions).values({
        userId: passkey.userId,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS)
      });
      return true;
    });
    if (!signedIn) return neutral();
    return Response.json({ status: "signed_in" }, { headers: { "set-cookie": sessionCookie(sessionToken) } });
  } catch {
    logger.error({ operation: "auth.login.verify" }, "Passkey authentication failed");
    return neutral();
  }
}
