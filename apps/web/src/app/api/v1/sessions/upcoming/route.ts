import { and, asc, eq, or } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function GET(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const sessions = await db.select({
    id: schema.duskSessions.id,
    startsAt: schema.duskSessions.startsAt,
    joinDeadline: schema.duskSessions.joinDeadline,
    status: schema.duskSessions.status,
    band: schema.duskSessions.band,
    userA: schema.duskSessions.userA,
    confirmedAAt: schema.duskSessions.confirmedAAt,
    confirmedBAt: schema.duskSessions.confirmedBAt,
    joinedAAt: schema.duskSessions.joinedAAt,
    joinedBAt: schema.duskSessions.joinedBAt
  }).from(schema.duskSessions)
    .where(and(
      or(eq(schema.duskSessions.userA, member.userId), eq(schema.duskSessions.userB, member.userId)),
      or(
        eq(schema.duskSessions.status, "proposed"),
        eq(schema.duskSessions.status, "confirmed"),
        eq(schema.duskSessions.status, "lobby"),
        eq(schema.duskSessions.status, "live"),
        eq(schema.duskSessions.status, "unveiled")
      )
    ))
    .orderBy(asc(schema.duskSessions.startsAt));
  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      startsAt: session.startsAt,
      joinDeadline: session.joinDeadline,
      status: session.status,
      band: session.band,
      confirmed: member.userId === session.userA ? Boolean(session.confirmedAAt) : Boolean(session.confirmedBAt),
      joined: member.userId === session.userA ? Boolean(session.joinedAAt) : Boolean(session.joinedBAt)
    }))
  });
}
