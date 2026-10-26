import { z } from "zod";

export const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
export const inviteCreateSchema = z.object({
  emails: z.array(emailSchema).min(1).max(50),
  zoneId: z.string().uuid().optional()
}).strict();
export const inviteOpenSchema = z.object({ token: z.string().min(32).max(200) }).strict();
export const sessionStatusSchema = z.enum([
  "proposed", "confirmed", "lobby", "live", "ended", "unveiled", "cancelled", "no_show"
]);
export const authChallengeIdSchema = z.string().uuid();
export const authenticatorTransportSchema = z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
export const registrationResponseSchema = z.object({
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1).max(2048),
  type: z.literal("public-key"),
  response: z.object({
    attestationObject: z.string().min(1).max(100_000),
    clientDataJSON: z.string().min(1).max(20_000),
    transports: z.array(authenticatorTransportSchema).optional()
  }).passthrough(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.string().nullable().optional()
}).passthrough();
export const authenticationResponseSchema = z.object({
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1).max(2048),
  type: z.literal("public-key"),
  response: z.object({
    authenticatorData: z.string().min(1).max(20_000),
    clientDataJSON: z.string().min(1).max(20_000),
    signature: z.string().min(1).max(20_000),
    userHandle: z.string().nullable().optional()
  }).passthrough(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  authenticatorAttachment: z.string().nullable().optional()
}).passthrough();
export const authenticationVerifySchema = z.object({
  challengeId: authChallengeIdSchema,
  response: authenticationResponseSchema
}).strict();
export const registrationVerifySchema = z.object({
  challengeId: authChallengeIdSchema,
  token: z.string().min(32).max(200),
  response: registrationResponseSchema
}).strict();
export const founderRequestSchema = z.object({ email: emailSchema }).strict();
export const recoveryCodeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(16).max(40)
}).strict();
export const recoveryRequestSchema = z.object({ email: emailSchema }).strict();
export const recoveryTokenSchema = z.object({ token: z.string().min(32).max(200) }).strict();
export const recoveryRegistrationVerifySchema = z.object({
  token: z.string().min(32).max(200),
  challengeId: authChallengeIdSchema,
  response: registrationResponseSchema
}).strict();
export const inviteIdSchema = z.string().uuid();
export const inviteRevokeSchema = z.object({ inviteId: inviteIdSchema }).strict();
export const verificationDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(200).optional()
}).strict();
export const eligibilitySchema = z.object({
  birthDate: z.string().date(),
  zoneId: z.string().uuid(),
  gender: z.string().trim().min(1).max(40),
  seeking: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  ageMin: z.number().int().min(18).max(100),
  ageMax: z.number().int().min(18).max(100),
  intent: z.enum(["long_term", "open_to_long_term", "casual_dating"]),
  consentVersion: z.string().trim().min(1).max(40)
}).strict().refine((profile) => profile.ageMax >= profile.ageMin);
export const eligibilityUpdateSchema = eligibilitySchema;
export const answerSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  questionVersion: z.number().int().positive(),
  value: z.unknown(),
  mustMatch: z.boolean().default(false)
}).strict();
export const availabilitySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440)
}).refine((window) => window.endMinute > window.startMinute);
export const availabilityUpdateSchema = z.object({
  timezone: z.string().trim().min(1).max(80),
  windows: z.array(availabilitySchema).min(1).max(21)
}).strict();
export const answersUpdateSchema = z.object({
  answers: z.array(answerSchema).min(1).max(100)
}).strict();
export const reportReasonSchema = z.enum([
  "harassment", "sexual_content", "identity_leak", "underage", "threats", "other"
]);
export const blockSchema = z.object({ userId: z.string().uuid() }).strict();
export const hiddenContactSchema = z.object({ email: emailSchema }).strict();
export const reportDecisionSchema = z.object({
  decision: z.enum(["dismiss", "suspend"])
}).strict();
export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
}).strict();
export const roomClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), sessionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("message"), body: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z.object({ type: z.literal("unveil_confirm") }).strict(),
  z.object({
    type: z.literal("report"),
    reason: z.string().trim().min(1).max(100),
    includeEvidence: z.boolean()
  }).strict()
]);

export type RoomClientEvent = z.infer<typeof roomClientEventSchema>;

export const publicErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});
