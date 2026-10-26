import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { inviteOpenSchema } from "@velum/contracts";
import { hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { webAuthnConfig } from "@/lib/webauthn";

const neutral = () => Response.json({ message: "This invitation could not be used. Check the link and try again." }, { status: 202 });

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
    if (!await allowRequest(request, "register-options", 10, 600)) return neutral();
    const parsed = inviteOpenSchema.safeParse(input);
    const now = new Date();
    const tokenHash = parsed.success ? hashToken(parsed.data.token) : null;
    const [invite] = tokenHash
      ? await db.select().from(schema.invites).where(eq(schema.invites.tokenHash, tokenHash)).limit(1)
      : [undefined];
    const validInvite = invite
      && (invite.status === "sent" || invite.status === "opened")
      && invite.expiresAt > now
      ? invite
      : undefined;
    const { rpID, rpName } = webAuthnConfig();
    const userId = randomUUID();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(userId, "utf8"),
      userName: `member-${userId.slice(0, 8)}`,
      userDisplayName: "Velum member",
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      }
    });
    const [challenge] = await db.insert(schema.authChallenges).values({
      challenge: options.challenge,
      purpose: "registration",
      inviteId: validInvite?.id ?? null,
      userId,
      expiresAt: new Date(now.getTime() + 5 * 60_000)
    }).returning({ id: schema.authChallenges.id });
    if (validInvite?.status === "sent") {
      await db.update(schema.invites).set({ status: "opened" }).where(eq(schema.invites.id, validInvite.id));
    }
    if (!challenge) throw new Error("Challenge could not be created");
    return Response.json({ challengeId: challenge.id, options });
  } catch {
    logger.error({ operation: "auth.register.options" }, "Registration options could not be created");
    return Response.json({ message: "Registration is temporarily unavailable." }, { status: 503 });
  }
}
