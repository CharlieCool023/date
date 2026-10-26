import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@velum/db";

export class InvalidVerificationState extends Error {
  constructor(message = "Verification cannot be changed in this state") {
    super(message);
    this.name = "InvalidVerificationState";
  }
}

export async function requestManualVerification(userId: string, selfieKey: string) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for("update");
    if (!user || !["onboarding", "pending_verification"].includes(user.status) || !user.recoveryCodesConfirmedAt) {
      throw new InvalidVerificationState();
    }
    if (!user.birthYear || !user.zoneId || !user.consentVersion) {
      throw new InvalidVerificationState("Eligibility must be complete before verification");
    }
    const photos = await tx.select({ id: schema.profilePhotos.id })
      .from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, userId));
    if (photos.length < 2) throw new InvalidVerificationState("At least two profile photos are required");
    const prior = await tx.select().from(schema.verifications)
      .where(and(eq(schema.verifications.userId, userId), eq(schema.verifications.status, "pending")))
      .for("update");
    if (prior.length > 0) throw new InvalidVerificationState("A verification is already being reviewed");
    const [created] = await tx.insert(schema.verifications).values({
      userId,
      selfieKey,
      provider: "manual",
      status: "pending"
    }).returning({ id: schema.verifications.id });
    await tx.update(schema.users).set({ status: "pending_verification" }).where(eq(schema.users.id, userId));
    return created?.id;
  });
}

export async function decideManualVerification(
  verificationId: string,
  actorId: string,
  status: "approved" | "rejected"
) {
  return db.transaction(async (tx) => {
    const [verification] = await tx.select().from(schema.verifications)
      .where(eq(schema.verifications.id, verificationId)).for("update");
    if (!verification || verification.status !== "pending") return null;
    const [user] = await tx.select().from(schema.users)
      .where(eq(schema.users.id, verification.userId)).for("update");
    if (!user || user.status !== "pending_verification") return null;
    await tx.update(schema.verifications).set({
      status,
      selfieKey: null,
      decidedBy: actorId,
      decidedAt: new Date()
    }).where(eq(schema.verifications.id, verification.id));
    await tx.update(schema.users).set({ status: "onboarding" }).where(eq(schema.users.id, user.id));
    if (status === "rejected") {
      await tx.insert(schema.emailOutbox).values({
        idempotencyKey: `verification_needed:${verification.id}:${user.id}`,
        userId: user.id,
        template: "verification_needed",
        params: { verificationId: verification.id }
      }).onConflictDoNothing();
    }
    await tx.insert(schema.auditLog).values({
      actorId,
      action: `admin.verification.${status}`,
      target: verification.id,
      meta: {}
    });
    return { userId: user.id, selfieKey: verification.selfieKey };
  });
}

export async function finalizeOnboarding(userId: string) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for("update");
    if (!user || user.status !== "onboarding" || !user.recoveryCodesConfirmedAt
      || !user.birthYear || !user.zoneId || !user.consentVersion) return false;
    const photos = await tx.select({ id: schema.profilePhotos.id })
      .from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, userId));
    const answers = await tx.select({ id: schema.answers.questionId })
      .from(schema.answers).where(eq(schema.answers.userId, userId));
    const availability = await tx.select({ id: schema.availability.id })
      .from(schema.availability).where(eq(schema.availability.userId, userId));
    const [verification] = await tx.select({ status: schema.verifications.status })
      .from(schema.verifications).where(and(
        eq(schema.verifications.userId, userId),
        inArray(schema.verifications.status, ["approved", "pending"])
        )).orderBy(desc(schema.verifications.createdAt)).limit(1);
    if (photos.length < 2 || answers.length < 12 || availability.length === 0 || verification?.status !== "approved") {
      return false;
    }
    await tx.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, userId));
    await tx.insert(schema.emailOutbox).values({
      idempotencyKey: `welcome:${userId}:${userId}:active`,
      userId,
      template: "welcome",
      params: {}
    }).onConflictDoNothing();
    return true;
  });
}
