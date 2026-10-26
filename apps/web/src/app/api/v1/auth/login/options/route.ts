import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { webAuthnConfig } from "@/lib/webauthn";

export async function POST(request: Request) {
  try {
    if (!await allowRequest(request, "login-options", 20, 600)) {
      return Response.json({ message: "If your passkey is registered, continue to sign in." }, { status: 202 });
    }
    const { rpID } = webAuthnConfig();
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    const [challenge] = await db.insert(schema.authChallenges).values({
      challenge: options.challenge,
      purpose: "login",
      expiresAt: new Date(Date.now() + 5 * 60_000)
    }).returning({ id: schema.authChallenges.id });
    if (!challenge) throw new Error("Challenge could not be created");
    return Response.json({ challengeId: challenge.id, options });
  } catch {
    logger.error({ operation: "auth.login.options" }, "Authentication options could not be created");
    return Response.json({ message: "Sign in is temporarily unavailable." }, { status: 503 });
  }
}
