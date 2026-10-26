import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const environmentSchema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  LOCAL_DEV_MASTER_KEY: z.string().optional(),
  BLIND_INDEX_KEY: z.string().min(32),
  MODERATION_PUBLIC_KEY: z.string().optional(),
  STORAGE_ENDPOINT: optionalUrl,
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET_PHOTOS: z.string().min(1),
  STORAGE_BUCKET_SELFIES: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["resend", "postmark"]).default("resend"),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1),
  EMAIL_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().min(1),
  WEBAUTHN_ORIGIN: z.string().url(),
  SENTRY_DSN: optionalUrl
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(source);
}

export function getAdminEmailIndexes(source: Environment): string[] {
  return source.ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
