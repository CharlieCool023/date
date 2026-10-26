import type { EmailTemplate } from "./index.js";

export interface TemplateContent {
  subject: string;
  preview: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  action: string;
  path: "signin" | "invite" | "recover";
  note?: string;
}

// Copy must stay generic: no names, photos, scores, addresses, or message content.
export const templateContent: Record<EmailTemplate, TemplateContent> = {
  invite: {
    subject: "You’ve been invited to Velum",
    preview: "A private invitation, meant for you alone.",
    eyebrow: "Private invitation",
    heading: "Someone thought of you.",
    paragraphs: [
      "You’ve been invited to Velum, a quieter way to meet. Conversations begin anonymously, and nothing is revealed unless both people choose it.",
      "This invitation is bound to this email address and can be used once."
    ],
    action: "Open your invitation",
    path: "invite",
    note: "Unused invitations expire after seven days. If you weren’t expecting this, you can safely ignore it."
  },
  welcome: {
    subject: "Welcome to Velum",
    preview: "Your account is ready.",
    eyebrow: "Welcome",
    heading: "Your account is ready.",
    paragraphs: ["Everything is in place. Open Velum to continue where you left off."],
    action: "Open Velum",
    path: "signin"
  },
  verification_needed: {
    subject: "An update from Velum",
    preview: "There is an update to your verification.",
    eyebrow: "Verification",
    heading: "An update on your verification.",
    paragraphs: ["There is an update to your verification. Sign in to review it and take the next step."],
    action: "Review in Velum",
    path: "signin"
  },
  session_proposed: {
    subject: "A session is ready to confirm",
    preview: "Sign in to review and confirm your upcoming session.",
    eyebrow: "New session",
    heading: "A conversation awaits.",
    paragraphs: ["A session has been proposed for you. Sign in to review the time and confirm if it suits you."],
    action: "Review session",
    path: "signin",
    note: "Sessions that aren’t confirmed in time are released automatically."
  },
  session_cancelled: {
    subject: "Your session update",
    preview: "Your upcoming session could not be held.",
    eyebrow: "Session update",
    heading: "This session won’t go ahead.",
    paragraphs: ["Your upcoming session could not be held. Nothing is needed from you; sign in to review your schedule."],
    action: "View schedule",
    path: "signin"
  },
  session_reminder: {
    subject: "Your session is coming up",
    preview: "Your session is approaching.",
    eyebrow: "Reminder",
    heading: "Your session is almost here.",
    paragraphs: ["Your session is approaching. Find a quiet moment and sign in to join when it’s time."],
    action: "Open Velum",
    path: "signin"
  },
  session_missed: {
    subject: "Your session update",
    preview: "Your session window has ended.",
    eyebrow: "Session update",
    heading: "Your session window has ended.",
    paragraphs: ["The window for your session has closed. Sign in to review your schedule."],
    action: "View schedule",
    path: "signin"
  },
  unveil_mutual: {
    subject: "A new conversation is ready",
    preview: "A conversation is available in Velum.",
    eyebrow: "New conversation",
    heading: "A conversation is ready.",
    paragraphs: ["A conversation is now available in Velum. Sign in to continue."],
    action: "Continue in Velum",
    path: "signin"
  },
  new_message: {
    subject: "You have a new message",
    preview: "Sign in to Velum to see it.",
    eyebrow: "New message",
    heading: "You have a new message.",
    paragraphs: ["Messages stay inside Velum. Sign in to read and reply."],
    action: "Open messages",
    path: "signin"
  },
  security_alert: {
    subject: "A security update for your account",
    preview: "There was a security event on your account.",
    eyebrow: "Security",
    heading: "A security event on your account.",
    paragraphs: ["There was a security event on your Velum account. If this was you, no action is needed."],
    action: "Review account",
    path: "signin",
    note: "If this wasn’t you, sign in and use your recovery codes to secure your account."
  },
  recovery_link: {
    subject: "A secure account recovery link",
    preview: "Your recovery waiting period has ended.",
    eyebrow: "Account recovery",
    heading: "Your recovery link is ready.",
    paragraphs: [
      "The waiting period for your recovery request has ended. Use the private link below to register a new passkey on this device.",
      "This link can be used once."
    ],
    action: "Continue recovery",
    path: "recover",
    note: "If you didn’t request recovery, do not open this link. Sign in with your existing passkey to keep your account secure."
  },
  report_received: {
    subject: "We received your report",
    preview: "Our team will review it.",
    eyebrow: "Safety",
    heading: "Thank you for telling us.",
    paragraphs: ["Your report was received. Our team will review it with care."],
    action: "Open Velum",
    path: "signin"
  },
  account_deleted: {
    subject: "Your account deletion request",
    preview: "Your account deletion request has been received.",
    eyebrow: "Account",
    heading: "Your deletion request was received.",
    paragraphs: [
      "Access to your account has been disabled. Your remaining data and private images are permanently removed after the seven-day retention period."
    ],
    action: "Visit Velum",
    path: "signin"
  }
};
