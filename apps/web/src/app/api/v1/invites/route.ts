import { eq, inArray } from "drizzle-orm";
import { inviteCreateSchema, inviteRevokeSchema } from "@velum/contracts";
import { createInvites } from "@velum/core";
import { decrypt } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { authenticatedUserId } from "@/lib/auth";
import { getBlindIndexKey, getEncryptionKey } from "@/lib/security";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const inviterId = await authenticatedUserId(request);
  if (!inviterId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Invitation details are invalid." }, { status: 400 });
  }
  const parsed = inviteCreateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Invitation details are invalid." }, { status: 400 });
  try {
    const ids = await createInvites(parsed.data, {
      inviterId,
      blindIndexKey: getBlindIndexKey(),
      encryptionKey: getEncryptionKey()
    });
    return Response.json({ status: "queued", count: ids.length }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.name === "InvitePermissionError") {
      return Response.json({ code: "INVITES_UNAVAILABLE", message: error.message }, { status: 403 });
    }
    logger.error({ operation: "invites.create", actorId: inviterId }, "Invitations could not be created");
    return Response.json({ code: "TEMPORARY_FAILURE", message: "Invitations are temporarily unavailable." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const [self] = await db.select({ role: schema.users.role })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const own = await db.select({
    id: schema.invites.id,
    status: schema.invites.status,
    expiresAt: schema.invites.expiresAt,
    createdAt: schema.invites.createdAt
  }).from(schema.invites).where(eq(schema.invites.inviterId, userId));
  if (self?.role !== "admin") return Response.json({ invites: own });
  const all = await db.select({
    id: schema.invites.id,
    status: schema.invites.status,
    expiresAt: schema.invites.expiresAt,
    createdAt: schema.invites.createdAt,
    emailCiphertext: schema.invites.emailCiphertext
  }).from(schema.invites);
  const showEmail = new URL(request.url).searchParams.get("includeEmail") === "true";
  if (showEmail) {
    await db.insert(schema.auditLog).values(all.map((invite) => ({
      actorId: userId,
      action: "admin.invite_email.viewed",
      target: invite.id,
      meta: {}
    })));
  }
  return Response.json({
    invites: all.map((invite) => ({
        id: invite.id,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        ...(showEmail ? {
          email: decrypt(invite.emailCiphertext, getEncryptionKey())
        } : {})
      }))
  });
}

export async function PATCH(request: Request) {
  const actorId = await authenticatedUserId(request);
  if (!actorId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const [actor] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, actorId)).limit(1);
  if (actor?.role !== "admin") return Response.json({ code: "FORBIDDEN", message: "Access not allowed." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Invitation details are invalid." }, { status: 400 });
  }
  const parsed = inviteRevokeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Invitation details are invalid." }, { status: 400 });
  const updated = await db.transaction(async (tx) => {
    const [invite] = await tx.select().from(schema.invites)
      .where(eq(schema.invites.id, parsed.data.inviteId)).for("update");
    if (!invite || invite.status === "redeemed" || invite.status === "revoked") return false;
    await tx.update(schema.invites).set({ status: "revoked" }).where(eq(schema.invites.id, invite.id));
    const pendingEmails = await tx.select({ id: schema.emailOutbox.id, params: schema.emailOutbox.params })
      .from(schema.emailOutbox).where(eq(schema.emailOutbox.template, "invite"));
    const matchingIds = pendingEmails
      .filter((email) => typeof email.params === "object" && email.params !== null
        && "inviteId" in email.params && email.params.inviteId === invite.id)
      .map((email) => email.id);
    if (matchingIds.length > 0) {
      await tx.update(schema.emailOutbox).set({ status: "suppressed", secretCiphertext: null })
        .where(inArray(schema.emailOutbox.id, matchingIds));
    }
    await tx.insert(schema.auditLog).values({ actorId, action: "admin.invite.revoked", target: invite.id, meta: {} });
    return true;
  });
  return Response.json({ status: updated ? "revoked" : "unchanged" });
}
