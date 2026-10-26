import { and, eq, gt, isNull } from "drizzle-orm";
import { recoveryRequestSchema } from "@velum/contracts";
import { encrypt, emailBlindIndex, generateToken, hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { allowRequest } from "@/lib/rate-limit";
import { getBlindIndexKey, getEncryptionKey } from "@/lib/security";
import { logger } from "@/lib/logger";

const neutral = () => Response.json({ message: "If an eligible account matches, recovery instructions will be sent after a security delay." }, { status: 202 });

export async function POST(request: Request) {
  let input: unknown;
  try {
    if (!await allowRequest(request, "recovery-email", 3, 3600)) return neutral();
    input = await request.json();
  } catch {
    return neutral();
  }
  const parsed = recoveryRequestSchema.safeParse(input);
  if (!parsed.success) return neutral();
  try {
    const blindIndex = emailBlindIndex(parsed.data.email, getBlindIndexKey());
    const [contact] = await db.select({ userId: schema.userContacts.userId })
      .from(schema.userContacts).where(eq(schema.userContacts.emailBlindIndex, blindIndex)).limit(1);
    if (!contact) return neutral();

    const now = new Date();
    const recoveryToken = generateToken();
    const eligibleAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60_000);
    await db.transaction(async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, contact.userId)).for("update");
      if (!user || user.status === "deleted" || user.status === "suspended") return;
      const recent = await tx.select({ id: schema.recoveryRequests.id })
        .from(schema.recoveryRequests)
        .where(and(
          eq(schema.recoveryRequests.userId, user.id),
          isNull(schema.recoveryRequests.usedAt),
          gt(schema.recoveryRequests.expiresAt, now)
        )).limit(1);
      if (recent.length) return;
      const [recovery] = await tx.insert(schema.recoveryRequests).values({
        userId: user.id,
        tokenHash: hashToken(recoveryToken),
        eligibleAt,
        expiresAt
      }).returning({ id: schema.recoveryRequests.id });
      if (!recovery) throw new Error("Recovery request could not be created");
      await tx.insert(schema.emailOutbox).values([
        {
          idempotencyKey: `recovery-alert:${recovery.id}`,
          userId: user.id,
          template: "security_alert",
          params: {}
        },
        {
          idempotencyKey: `recovery-link:${recovery.id}`,
          userId: user.id,
          template: "recovery_link",
          params: { recoveryRequestId: recovery.id },
          secretCiphertext: encrypt(recoveryToken, getEncryptionKey()),
          sendAfter: eligibleAt
        }
      ]);
      await tx.insert(schema.auditLog).values({
        action: "auth.recovery.requested",
        target: user.id,
        meta: {}
      });
    });
    return neutral();
  } catch {
    logger.error({ operation: "auth.recovery.email" }, "Recovery request could not be created");
    return neutral();
  }
}
