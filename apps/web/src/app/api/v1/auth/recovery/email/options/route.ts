import { and, eq, gt, isNull } from "drizzle-orm";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { recoveryTokenSchema } from "@velum/contracts";
import { hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { webAuthnConfig } from "@/lib/webauthn";

const neutral = () => Response.json({ message: "This recovery link is not available." }, { status: 202 });

export async function POST(request: Request) {
  let input: unknown;
  try {
    if (!await allowRequest(request, "recovery-email-options", 10, 600)) return neutral();
    input = await request.json();
  } catch {
    return neutral();
  }
  const parsed = recoveryTokenSchema.safeParse(input);
  if (!parsed.success) return neutral();
  try {
    const now = new Date();
    const [recovery] = await db.select().from(schema.recoveryRequests).where(and(
      eq(schema.recoveryRequests.tokenHash, hashToken(parsed.data.token)),
      isNull(schema.recoveryRequests.usedAt),
      gt(schema.recoveryRequests.eligibleAt, new Date(now.getTime() - 1000)),
      gt(schema.recoveryRequests.expiresAt, now)
    )).limit(1);
    if (!recovery || recovery.eligibleAt > now) return neutral();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, recovery.userId)).limit(1);
    if (!user || user.status === "deleted" || user.status === "suspended") return neutral();
    const existing = await db.select({
      id: schema.passkeys.credentialId,
      transports: schema.passkeys.transports
    }).from(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
    const { rpID, rpName } = webAuthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(user.id, "utf8"),
      userName: `member-${user.id.slice(0, 8)}`,
      userDisplayName: "Velum member",
      attestationType: "none",
      excludeCredentials: existing.map((credential) => ({
        id: credential.id,
        transports: credential.transports as AuthenticatorTransport[] | undefined
      })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" }
    });
    const [challenge] = await db.insert(schema.authChallenges).values({
      challenge: options.challenge,
      purpose: "email_recovery",
      userId: user.id,
      expiresAt: new Date(now.getTime() + 5 * 60_000)
    }).returning({ id: schema.authChallenges.id });
    if (!challenge) throw new Error("Recovery challenge could not be created");
    return Response.json({ challengeId: challenge.id, options });
  } catch {
    logger.error({ operation: "auth.recovery.email.options" }, "Recovery passkey options could not be created");
    return neutral();
  }
}
