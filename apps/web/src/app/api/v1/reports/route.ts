import { and, eq, or } from "drizzle-orm";
import { reportReasonSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Report details are invalid." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("sessionId" in body) || !("reason" in body)) {
    return Response.json({ code: "INVALID_INPUT", message: "Report details are invalid." }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const reason = reportReasonSchema.safeParse(body.reason);
  if (!reason.success) return Response.json({ code: "INVALID_INPUT", message: "Report details are invalid." }, { status: 400 });
  const [session] = await db.select().from(schema.duskSessions).where(and(
    eq(schema.duskSessions.id, sessionId),
    or(eq(schema.duskSessions.userA, member.userId), eq(schema.duskSessions.userB, member.userId))
  )).limit(1);
  if (!session) return Response.json({ code: "NOT_FOUND", message: "Session not found." }, { status: 404 });
  const reportedId = session.userA === member.userId ? session.userB : session.userA;
  await db.transaction(async (tx) => {
    const created = await tx.insert(schema.reports).values({
      reporterId: member.userId,
      reportedId,
      sessionId,
      reason: reason.data
    }).returning({ id: schema.reports.id });
    if (created[0]) {
      await tx.insert(schema.emailOutbox).values({
        idempotencyKey: `report_received:${created[0].id}:${member.userId}`,
        userId: member.userId,
        template: "report_received",
        params: { reportId: created[0].id }
      }).onConflictDoNothing();
    }
  });
  return Response.json({ status: "received" }, { status: 202 });
}
