import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { removeImage } from "@velum/storage";
import { logger } from "@/lib/logger";
import { requireMember } from "@/lib/member";

export async function DELETE(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const { photoId } = await params;
  const [photo] = await db.select().from(schema.profilePhotos).where(eq(schema.profilePhotos.id, photoId)).limit(1);
  if (!photo || photo.userId !== member.userId) {
    return Response.json({ code: "NOT_FOUND", message: "Photo not found." }, { status: 404 });
  }
  await db.delete(schema.profilePhotos).where(eq(schema.profilePhotos.id, photo.id));
  try {
    await removeImage(photo.storageKey, "photo");
  } catch {
    logger.error({ operation: "photos.delete", userId: member.userId }, "Private photo cleanup failed");
    return Response.json({ code: "TEMPORARY_FAILURE", message: "The photo was removed from your profile; storage cleanup is pending." }, { status: 503 });
  }
  return Response.json({ status: "deleted" });
}
