import { and, count, eq, gte, sql } from "drizzle-orm";
import { inviteCreateSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { emailBlindIndex, encrypt, generateToken, hashToken } from "@velum/crypto";

const DAILY_INVITE_LIMIT = 50;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export class InvitePermissionError extends Error {
  constructor(message = "Invitations are not available for this account") {
    super(message);
    this.name = "InvitePermissionError";
  }
}

export async function createInvites(
  payload: unknown,
  options: { inviterId: string | null; blindIndexKey: string; encryptionKey: Uint8Array; now?: Date }
): Promise<string[]> {
  const input = inviteCreateSchema.parse(payload);
  const emails = [...new Set(input.emails)];
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    let inviter: typeof schema.users.$inferSelect | undefined;
    if (options.inviterId) {
      const [row] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, options.inviterId))
        .for("update");
      inviter = row;
      if (!inviter || inviter.status !== "active" || (inviter.role !== "admin" && inviter.role !== "member")) {
        throw new InvitePermissionError();
      }
      if (inviter.role !== "admin" && inviter.invitesRemaining < emails.length) {
        throw new InvitePermissionError("Not enough invitations remain");
      }
    }

    const [sentToday] = await tx.select({ value: count() }).from(schema.invites)
      .where(gte(schema.invites.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
    if ((sentToday?.value ?? 0) + emails.length > DAILY_INVITE_LIMIT) {
      throw new InvitePermissionError("The daily invitation limit has been reached");
    }

    const inviteIds: string[] = [];
    for (const email of emails) {
      const token = generateToken();
      const [invite] = await tx.insert(schema.invites).values({
        inviterId: options.inviterId,
        tokenHash: hashToken(token),
        inviteeEmailBlindIndex: emailBlindIndex(email, options.blindIndexKey),
        emailCiphertext: encrypt(email, options.encryptionKey),
        zoneId: input.zoneId,
        expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS)
      }).returning({ id: schema.invites.id });
      if (!invite) throw new Error("Invite could not be created");
      inviteIds.push(invite.id);
      await tx.insert(schema.emailOutbox).values({
        idempotencyKey: `invite:${invite.id}:${invite.id}`,
        template: "invite",
        params: { inviteId: invite.id },
        secretCiphertext: encrypt(token, options.encryptionKey)
      });
    }

    if (inviter && inviter.role !== "admin") {
      await tx.update(schema.users)
        .set({ invitesRemaining: sql`${schema.users.invitesRemaining} - ${emails.length}` })
        .where(and(eq(schema.users.id, inviter.id), gte(schema.users.invitesRemaining, emails.length)));
    }
    if (options.inviterId) {
      await tx.insert(schema.auditLog).values({
        actorId: options.inviterId,
        action: "invites.created",
        meta: { count: inviteIds.length }
      });
    }
    return inviteIds;
  });
}
