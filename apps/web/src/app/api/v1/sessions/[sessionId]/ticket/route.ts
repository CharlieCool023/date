import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";
import { issueRoomTicket } from "@/lib/room-ticket";

const paramsSchema = z.object({ sessionId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return Response.json({ code: "NOT_FOUND", message: "Session not found." }, { status: 404 });
  const [session] = await db.select({
    userA: schema.duskSessions.userA,
    userB: schema.duskSessions.userB,
    status: schema.duskSessions.status
  }).from(schema.duskSessions).where(eq(schema.duskSessions.id, parsed.data.sessionId)).limit(1);
  if (!session || (session.userA !== member.userId && session.userB !== member.userId)
    || !["confirmed", "lobby", "live"].includes(session.status)) {
    return Response.json({ code: "NOT_FOUND", message: "Session not found." }, { status: 404 });
  }
  try {
    const ticket = await issueRoomTicket(member.userId, parsed.data.sessionId);
    return Response.json({ ticket }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ code: "TEMPORARY_FAILURE", message: "The private room is unavailable right now." }, { status: 503 });
  }
}
