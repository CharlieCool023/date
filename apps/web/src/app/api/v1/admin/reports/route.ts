import { asc, eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: Request) {
  const actor = await requireAdmin(request);
  if ("response" in actor) return actor.response;
  const reports = await db.select({
    id: schema.reports.id,
    reporterId: schema.reports.reporterId,
    reportedId: schema.reports.reportedId,
    sessionId: schema.reports.sessionId,
    reason: schema.reports.reason,
    status: schema.reports.status,
    createdAt: schema.reports.createdAt
  }).from(schema.reports).where(eq(schema.reports.status, "open"))
    .orderBy(asc(schema.reports.createdAt));
  await db.insert(schema.auditLog).values(reports.map((report) => ({
    actorId: actor.userId,
    action: "admin.reports.viewed",
    target: report.id,
    meta: {}
  })));
  return Response.json({ reports });
}
