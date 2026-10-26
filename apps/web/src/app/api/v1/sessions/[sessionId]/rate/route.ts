import { and, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Feedback is invalid." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("respectful" in body) || typeof body.respectful !== "boolean") {
    return Response.json({ code: "INVALID_INPUT", message: "Feedback is invalid." }, { status: 400 });
  }
  const { sessionId } = await params;
  const [session] = await db.select().from(schema.duskSessions).where(and(
    eq(schema.duskSessions.id, sessionId),
    or(eq(schema.duskSessions.userA, member.userId), eq(schema.duskSessions.userB, member.userId)),
    or(eq(schema.duskSessions.status, "ended"), eq(schema.duskSessions.status, "unveiled"))
  )).limit(1);
  if (!session) return Response.json({ code: "NOT_FOUND", message: "Session not found." }, { status: 404 });
  const peerId = session.userA === member.userId ? session.userB : session.userA;
  const delta = body.respectful ? 1 : -5;
  const [event] = await db.insert(schema.reputationEvents).values({
    userId: peerId,
    sessionId,
    kind: body.respectful ? "respectful_vote" : "disrespect_vote",
    delta
  }).onConflictDoNothing().returning({ id: schema.reputationEvents.id });
  if (event) {
    await db.update(schema.users).set({
      reputation: sql`least(100, greatest(0, ${schema.users.reputation} + ${delta}))`
    }).where(eq(schema.users.id, peerId));
  }
  return Response.json({ status: event ? "received" : "already_received" }, { status: event ? 202 : 200 });
}
