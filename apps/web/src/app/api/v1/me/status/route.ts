import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { authenticatedUserId } from "@/lib/auth";

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const [user] = await db.select({
    status: schema.users.status,
    role: schema.users.role,
    recoveryCodesConfirmedAt: schema.users.recoveryCodesConfirmedAt,
    birthYear: schema.users.birthYear,
    zoneId: schema.users.zoneId,
    consentVersion: schema.users.consentVersion
  }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return Response.json({ code: "UNAUTHORIZED", message: "Sign in required." }, { status: 401 });
  const [verification] = await db.select({ status: schema.verifications.status })
    .from(schema.verifications).where(eq(schema.verifications.userId, userId)).limit(1);
  const photos = await db.select({ id: schema.profilePhotos.id })
    .from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, userId));
  const answers = await db.select({ id: schema.answers.questionId })
    .from(schema.answers).where(eq(schema.answers.userId, userId));
  const windows = await db.select({ id: schema.availability.id })
    .from(schema.availability).where(eq(schema.availability.userId, userId));
  return Response.json({
    status: user.status,
    role: user.role,
    recoveryCodesConfirmed: user.recoveryCodesConfirmedAt !== null,
    eligibilityComplete: user.birthYear !== null && user.zoneId !== null && user.consentVersion !== null,
    verification: verification?.status ?? null,
    photoCount: photos.length,
    answerCount: answers.length,
    availabilityCount: windows.length
  });
}
