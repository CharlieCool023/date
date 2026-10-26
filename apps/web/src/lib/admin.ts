import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { authenticatedUserId } from "./auth";

export async function requireAdmin(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { response: Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 }) };
  const [user] = await db.select({ role: schema.users.role, status: schema.users.status })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user || (user.role !== "admin" && user.role !== "moderator")
    || user.status === "suspended" || user.status === "deleted") {
    return { response: Response.json({ code: "FORBIDDEN", message: "Access not allowed." }, { status: 403 }) };
  }
  return { userId, role: user.role as "admin" | "moderator" };
}
