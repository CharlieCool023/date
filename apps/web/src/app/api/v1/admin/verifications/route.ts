import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { getImageUrl } from "@velum/storage";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const actor = await requireAdmin(request);
  if ("response" in actor) return actor.response;
  try {
    const queue = await db.select({
      id: schema.verifications.id,
      userId: schema.verifications.userId,
      selfieKey: schema.verifications.selfieKey,
      createdAt: schema.verifications.createdAt
    }).from(schema.verifications).where(eq(schema.verifications.status, "pending"));
    await db.insert(schema.auditLog).values(queue.map((item) => ({
      actorId: actor.userId,
      action: "admin.verification_queue.viewed",
      target: item.id,
      meta: {}
    })));
    const result = await Promise.all(queue.map(async (item) => {
      const photos = await db.select({
        id: schema.profilePhotos.id,
        position: schema.profilePhotos.position,
        storageKey: schema.profilePhotos.storageKey
      }).from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, item.userId));
      return {
        id: item.id,
        userId: item.userId,
        createdAt: item.createdAt,
        selfieUrl: item.selfieKey ? await getImageUrl(item.selfieKey, "selfie") : null,
        photos: await Promise.all(photos.map(async (photo) => ({
          id: photo.id,
          position: photo.position,
          url: await getImageUrl(photo.storageKey, "photo")
        })))
      };
    }));
    return Response.json({ verifications: result }, { headers: { "cache-control": "no-store" } });
  } catch {
    logger.error({ operation: "admin.verifications.list", actorId: actor.userId }, "Verification queue could not be loaded");
    return Response.json({ code: "TEMPORARY_FAILURE", message: "Verification queue is temporarily unavailable." }, { status: 503 });
  }
}
