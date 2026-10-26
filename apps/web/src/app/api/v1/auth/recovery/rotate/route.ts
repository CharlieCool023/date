import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@velum/db";
import { hashToken } from "@velum/crypto";
import { authenticatedUserId } from "@/lib/auth";

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const codes = Array.from({ length: 10 }, () => randomBytes(8).toString("hex").toUpperCase());
  const created = await db.transaction(async (tx) => {
    const [user] = await tx.select({ confirmedAt: schema.users.recoveryCodesConfirmedAt })
      .from(schema.users).where(eq(schema.users.id, userId)).for("update");
    if (!user || user.confirmedAt) return false;
    await tx.delete(schema.recoveryCodes).where(and(
      eq(schema.recoveryCodes.userId, userId),
      isNull(schema.recoveryCodes.usedAt)
    ));
    await tx.insert(schema.recoveryCodes).values(codes.map((code) => ({ userId, codeHash: hashToken(code) })));
    return true;
  });
  if (!created) return Response.json({ code: "ALREADY_CONFIRMED", message: "Recovery codes have already been confirmed." }, { status: 409 });
  return Response.json({ recoveryCodes: codes });
}

