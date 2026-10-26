import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { getImageUrl } from "@velum/storage";
import { requireMember } from "@/lib/member";

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const { sessionId } = await params;
  const [session] = await db.select().from(schema.duskSessions)
    .where(and(
      eq(schema.duskSessions.id, sessionId),
      eq(schema.duskSessions.status, "unveiled"),
      or(eq(schema.duskSessions.userA, member.userId), eq(schema.duskSessions.userB, member.userId))
    )).limit(1);
  if (!session) return Response.json({ code: "NOT_FOUND", message: "This session is not available." }, { status: 404 });
  const peerId = member.userId === session.userA ? session.userB : session.userA;
  const [peer] = await db.select({
    gender: schema.users.gender,
    birthYear: schema.users.birthYear,
    intent: schema.users.intent
  }).from(schema.users).where(eq(schema.users.id, peerId)).limit(1);
  if (!peer) return Response.json({ code: "NOT_FOUND", message: "This session is not available." }, { status: 404 });
  const photos = await db.select({
    id: schema.profilePhotos.id,
    position: schema.profilePhotos.position,
    storageKey: schema.profilePhotos.storageKey
  }).from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, peerId));
  const mine = await db.select({
    questionId: schema.answers.questionId,
    value: schema.answers.value
  }).from(schema.answers).where(eq(schema.answers.userId, member.userId));
  const their = await db.select({
    questionId: schema.answers.questionId,
    value: schema.answers.value
  }).from(schema.answers).where(eq(schema.answers.userId, peerId));
  const myAnswers = new Map(mine.map((answer) => [answer.questionId, JSON.stringify(answer.value)]));
  const sharedQuestionIds = their.filter((answer) => myAnswers.get(answer.questionId) === JSON.stringify(answer.value))
    .map((answer) => answer.questionId);
  return Response.json({
    profile: {
      gender: peer.gender,
      birthYear: peer.birthYear,
      intent: peer.intent,
      photos: await Promise.all(photos.map(async (photo) => ({
        id: photo.id,
        position: photo.position,
        url: await getImageUrl(photo.storageKey, "photo")
      }))),
      sharedQuestionIds
    }
  }, { headers: { "cache-control": "no-store" } });
}
