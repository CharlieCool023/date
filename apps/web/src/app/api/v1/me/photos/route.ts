import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { storeImage, removeImage } from "@velum/storage";
import { logger } from "@/lib/logger";
import { requireMember } from "@/lib/member";

const MAX_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const photos = await db.select({
    id: schema.profilePhotos.id,
    position: schema.profilePhotos.position
  }).from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, member.userId));
  return Response.json({ photos });
}

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  if (member.status !== "onboarding" && member.status !== "pending_verification") {
    return Response.json({ code: "INVALID_STATE", message: "Photos cannot be changed in this state." }, { status: 409 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Choose an image to upload." }, { status: 400 });
  }
  const file = form.get("image");
  const positionValue = form.get("position");
  const position = typeof positionValue === "string" ? Number(positionValue) : Number.NaN;
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_BYTES
    || !Number.isInteger(position) || position < 0 || position > 3) {
    return Response.json({ code: "INVALID_INPUT", message: "Choose a valid image and position." }, { status: 400 });
  }
  const [existing] = await db.select().from(schema.profilePhotos).where(and(
    eq(schema.profilePhotos.userId, member.userId),
    eq(schema.profilePhotos.position, position)
  )).limit(1);
  if (!existing) {
    const [countRow] = await db.select({ total: count() })
      .from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, member.userId));
    if ((countRow?.total ?? 0) >= 4) return Response.json({ code: "PHOTO_LIMIT", message: "You can add up to four photos." }, { status: 409 });
  }

  let newKey: string | null = null;
  try {
    newKey = await storeImage(new Uint8Array(await file.arrayBuffer()), member.userId, "photo");
    await db.insert(schema.profilePhotos).values({
      userId: member.userId,
      position,
      storageKey: newKey
    }).onConflictDoUpdate({
      target: [schema.profilePhotos.userId, schema.profilePhotos.position],
      set: { storageKey: newKey }
    });
  } catch {
    if (newKey) {
      await removeImage(newKey, "photo").catch(() => {
        logger.error({ operation: "photos.cleanup", userId: member.userId }, "Unattached profile image cleanup failed");
      });
    }
    logger.error({ operation: "photos.upload", userId: member.userId }, "Profile image upload failed");
    return Response.json({ code: "UPLOAD_FAILED", message: "The image could not be stored. Try again." }, { status: 503 });
  }
  if (existing) {
    try {
      await removeImage(existing.storageKey, "photo");
    } catch {
      logger.error({ operation: "photos.replace", userId: member.userId }, "Replaced private photo cleanup failed");
      return Response.json({ code: "TEMPORARY_FAILURE", message: "The new photo is saved; cleanup of the previous file is pending." }, { status: 503 });
    }
  }
  return Response.json({ status: "saved", position }, { status: 201 });
}
