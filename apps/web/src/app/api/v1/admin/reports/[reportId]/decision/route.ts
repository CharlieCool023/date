import { and, eq, or, sql } from "drizzle-orm";
import { reportDecisionSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { requireAdmin } from "@/lib/admin";

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const actor = await requireAdmin(request);
  if ("response" in actor) return actor.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Decision is invalid." }, { status: 400 });
  }
  const parsed = reportDecisionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Decision is invalid." }, { status: 400 });
  const { reportId } = await params;
  const updated = await db.transaction(async (tx) => {
    const [report] = await tx.select().from(schema.reports)
      .where(eq(schema.reports.id, reportId)).for("update");
    if (!report || report.status !== "open") return false;
    if (parsed.data.decision === "suspend") {
      const [reportedUser] = await tx.select().from(schema.users)
        .where(eq(schema.users.id, report.reportedId)).for("update");
      if (reportedUser && reportedUser.status !== "deleted") {
        await tx.insert(schema.reputationEvents).values({
          userId: reportedUser.id,
          reportId: report.id,
          kind: "report_upheld",
          delta: -20
        }).onConflictDoNothing().returning({ id: schema.reputationEvents.id });
        await tx.update(schema.users).set({
          reputation: sql`greatest(0, ${schema.users.reputation} - 20)`
        }).where(eq(schema.users.id, reportedUser.id));
        await tx.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, reportedUser.id));
        await tx.update(schema.duskSessions).set({ status: "ended", endReason: "reported" })
          .where(and(
            or(eq(schema.duskSessions.userA, reportedUser.id), eq(schema.duskSessions.userB, reportedUser.id)),
            or(eq(schema.duskSessions.status, "proposed"), eq(schema.duskSessions.status, "confirmed"),
              eq(schema.duskSessions.status, "lobby"), eq(schema.duskSessions.status, "live"))
          ));
        await tx.update(schema.conversations).set({ status: "closed" }).where(and(
          eq(schema.conversations.status, "open"),
          or(eq(schema.conversations.userA, reportedUser.id), eq(schema.conversations.userB, reportedUser.id))
        ));
        if (reportedUser.invitedBy) {
          const [event] = await tx.insert(schema.reputationEvents).values({
            userId: reportedUser.invitedBy,
            reportId: report.id,
            kind: "inviter_accountability",
            delta: -10
          }).onConflictDoNothing().returning({ id: schema.reputationEvents.id });
          if (event) {
            await tx.update(schema.users).set({
              reputation: sql`greatest(0, ${schema.users.reputation} - 10)`
            }).where(eq(schema.users.id, reportedUser.invitedBy));
          }
        }
      }
    }
    await tx.update(schema.reports).set({
      status: parsed.data.decision === "suspend" ? "actioned" : "dismissed"
    }).where(eq(schema.reports.id, report.id));
    await tx.insert(schema.auditLog).values({
      actorId: actor.userId,
      action: `admin.report.${parsed.data.decision}`,
      target: report.id,
      meta: {}
    });
    return true;
  });
  return updated
    ? Response.json({ status: parsed.data.decision === "suspend" ? "actioned" : "dismissed" })
    : Response.json({ code: "STATE_CHANGED", message: "This report was already reviewed." }, { status: 409 });
}
