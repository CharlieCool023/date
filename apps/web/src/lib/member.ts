import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { authenticatedUserId } from "./auth";

export async function requireMember(request: Request, requireRecoveryConfirmation = true) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { response: Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 }) };
  const [user] = await db.select({
    status: schema.users.status,
    recoveryCodesConfirmedAt: schema.users.recoveryCodesConfirmedAt
  }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user || user.status === "deleted" || user.status === "suspended") {
    return { response: Response.json({ code: "FORBIDDEN", message: "Access not allowed." }, { status: 403 }) };
  }
  if (requireRecoveryConfirmation && !user.recoveryCodesConfirmedAt) {
    return { response: Response.json({ code: "RECOVERY_CONFIRMATION_REQUIRED", message: "Confirm your recovery codes to continue." }, { status: 403 }) };
  }
  return { userId, status: user.status };
}
