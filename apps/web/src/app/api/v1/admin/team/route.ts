import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@velum/db";
import { requireAdmin } from "@/lib/admin";

const roleSchema = z.object({ userId: z.string().uuid(), role: z.enum(["member", "moderator", "admin"]) }).strict();

export async function GET(request: Request) {
  const actor = await requireAdmin(request);
  if ("response" in actor) return actor.response;
  if (actor.role !== "admin") return Response.json({ code: "FORBIDDEN" }, { status: 403 });

  const members = await db.select({ id: schema.users.id, role: schema.users.role, status: schema.users.status, createdAt: schema.users.createdAt })
    .from(schema.users).where(eq(schema.users.status, "active")).orderBy(schema.users.createdAt);
  return Response.json({ members });
}

export async function PATCH(request: Request) {
  const actor = await requireAdmin(request);
  if ("response" in actor) return actor.response;
  if (actor.role !== "admin") return Response.json({ code: "FORBIDDEN" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
  if (parsed.data.userId === actor.userId) return Response.json({ code: "SELF_ROLE_CHANGE_NOT_ALLOWED" }, { status: 400 });

  const updated = await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: schema.users.id, role: schema.users.role, status: schema.users.status })
      .from(schema.users).where(eq(schema.users.id, parsed.data.userId)).for("update").limit(1);
    if (!target || target.status === "deleted") return { error: "NOT_FOUND" as const };
    if (target.role === parsed.data.role) return { error: "UNCHANGED" as const };
    if (target.role === "admin" && parsed.data.role !== "admin") {
      const activeAdmins = await tx.select({ id: schema.users.id }).from(schema.users)
        .where(eq(schema.users.role, "admin")).for("update");
      if (activeAdmins.filter((user) => user.id !== target.id).length === 0) return { error: "LAST_ADMIN" as const };
    }
    await tx.update(schema.users).set({ role: parsed.data.role }).where(eq(schema.users.id, target.id));
    await tx.insert(schema.auditLog).values({ actorId: actor.userId, action: "admin.team.role_changed", target: target.id, meta: { from: target.role, to: parsed.data.role } });
    return { role: parsed.data.role };
  });

  if ("error" in updated) {
    const status = updated.error === "NOT_FOUND" ? 404 : updated.error === "LAST_ADMIN" ? 409 : 400;
    return Response.json({ code: updated.error }, { status });
  }
  return Response.json({ userId: parsed.data.userId, role: updated.role });
}
