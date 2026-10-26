import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { removeImage } from "@velum/storage";
import { authenticatedUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function DELETE(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const photos = await db.select({ storageKey: schema.profilePhotos.storageKey })
    .from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, userId));
  const selfies = await db.select({ selfieKey: schema.verifications.selfieKey })
    .from(schema.verifications).where(eq(schema.verifications.userId, userId));

  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ status: "deleted", deletedAt: new Date() })
      .where(eq(schema.users.id, userId));
    await tx.delete(schema.authSessions).where(eq(schema.authSessions.userId, userId));
    await tx.update(schema.duskSessions).set({ status: "ended", endReason: "timeout" })
      .where(and(
        or(eq(schema.duskSessions.userA, userId), eq(schema.duskSessions.userB, userId)),
        or(eq(schema.duskSessions.status, "proposed"), eq(schema.duskSessions.status, "confirmed"),
          eq(schema.duskSessions.status, "lobby"), eq(schema.duskSessions.status, "live"))
      ));
    await tx.update(schema.conversations).set({ status: "closed" }).where(and(
      eq(schema.conversations.status, "open"),
      or(eq(schema.conversations.userA, userId), eq(schema.conversations.userB, userId))
    ));
    await tx.delete(schema.emailOutbox).where(eq(schema.emailOutbox.userId, userId));
    await tx.insert(schema.emailOutbox).values({
      idempotencyKey: `account_deleted:${userId}:${userId}`,
      userId,
      template: "account_deleted",
      params: {}
    }).onConflictDoNothing();
  });

  const cleanup = await Promise.allSettled([
    ...photos.map((photo) => removeImage(photo.storageKey, "photo")),
    ...selfies.flatMap((item) => item.selfieKey ? [removeImage(item.selfieKey, "selfie")] : [])
  ]);
  if (cleanup.some((result) => result.status === "rejected")) {
    logger.error({ operation: "account.delete.storage", userId }, "One or more private account images could not be purged");
  }
  return Response.json({
    status: "deletion_scheduled",
    hardDeleteWithinDays: 7,
    ...(cleanup.some((result) => result.status === "rejected") ? { storageCleanupPending: true } : {})
  });
}
