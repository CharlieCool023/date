import { and, eq, isNull } from "drizzle-orm";
import { authenticatedUserId } from "@/lib/auth";
import { db, schema } from "@velum/db";

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const codes = await db.select({ id: schema.recoveryCodes.id })
    .from(schema.recoveryCodes).where(and(
      eq(schema.recoveryCodes.userId, userId),
      isNull(schema.recoveryCodes.usedAt)
    ));
  if (codes.length !== 10) {
    return Response.json({ code: "RECOVERY_CODES_UNAVAILABLE", message: "Recovery codes must be regenerated before continuing." }, { status: 409 });
  }
  const [user] = await db.update(schema.users)
    .set({ recoveryCodesConfirmedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning({ status: schema.users.status });
  return Response.json({ status: "confirmed", next: user?.status === "active" ? "/me" : "/onboarding" });
}
