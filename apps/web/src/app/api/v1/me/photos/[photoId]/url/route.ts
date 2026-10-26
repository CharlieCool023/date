import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { getImageUrl } from "@velum/storage";
import { requireMember } from "@/lib/member";

export async function GET(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const { photoId } = await params;
  const [photo] = await db.select().from(schema.profilePhotos)
    .where(eq(schema.profilePhotos.id, photoId)).limit(1);
  if (!photo) return Response.json({ code: "NOT_FOUND", message: "Photo not found." }, { status: 404 });
  let permitted = photo.userId === member.userId;
  if (!permitted) {
    const unlocked = await db.select({ id: schema.duskSessions.id }).from(schema.duskSessions)
      .where(and(
        eq(schema.duskSessions.status, "unveiled"),
        or(
          and(eq(schema.duskSessions.userA, member.userId), eq(schema.duskSessions.userB, photo.userId)),
          and(eq(schema.duskSessions.userB, member.userId), eq(schema.duskSessions.userA, photo.userId))
        )
      )).limit(1);
    const blocks = await db.select({ blockerId: schema.blocks.blockerId }).from(schema.blocks)
      .where(or(
        and(eq(schema.blocks.blockerId, member.userId), eq(schema.blocks.blockedId, photo.userId)),
        and(eq(schema.blocks.blockerId, photo.userId), eq(schema.blocks.blockedId, member.userId))
      )).limit(1);
    permitted = unlocked.length > 0 && blocks.length === 0;
  }
  if (!permitted) return Response.json({ code: "NOT_FOUND", message: "Photo not found." }, { status: 404 });
  const url = await getImageUrl(photo.storageKey, "photo");
  return Response.json({ url }, { headers: { "cache-control": "no-store" } });
}
