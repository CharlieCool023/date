import { createElement } from "react";
import { render } from "@react-email/components";
import { EmailLayout } from "./email-layout.js";
import { templateContent, type TemplateContent } from "./template-content.js";

export type EmailTemplate =
  | "invite"
  | "welcome"
  | "verification_needed"
  | "session_proposed"
  | "session_cancelled"
  | "session_reminder"
  | "session_missed"
  | "unveil_mutual"
  | "new_message"
  | "security_alert"
  | "recovery_link"
  | "report_received"
  | "account_deleted";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function actionUrl(content: TemplateContent, appUrl: string, token: string | undefined): string {
  if (content.path === "signin") return new URL("/signin", appUrl).toString();
  if (!token) throw new Error(content.path === "invite" ? "Invite email requires a token" : "Recovery email requires a token");
  return new URL(`/${content.path}/${encodeURIComponent(token)}`, appUrl).toString();
}

function plainText(content: TemplateContent, url: string): string {
  return [
    "VELUM",
    "",
    content.heading,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    `${content.action}: ${url}`,
    ...(content.note ? ["", content.note] : []),
    "",
    "Velum will never ask for your passkey or recovery codes by email."
  ].join("\n");
}

export async function renderEmail(template: EmailTemplate, appUrl: string, token?: string): Promise<RenderedEmail> {
  const content = templateContent[template];
  const url = actionUrl(content, appUrl, token);
  const html = await render(createElement(EmailLayout, { content, actionUrl: url, appUrl }));
  return { subject: content.subject, text: plainText(content, url), html };
}

export async function sendEmail(
  provider: "resend" | "postmark",
  apiKey: string,
  from: string,
  recipient: string,
  email: RenderedEmail,
  idempotencyKey: string
): Promise<void> {
  const endpoint = provider === "resend"
    ? "https://api.resend.com/emails"
    : "https://api.postmarkapp.com/email";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider === "resend") {
    headers.authorization = `Bearer ${apiKey}`;
    headers["Idempotency-Key"] = idempotencyKey;
  }
  else headers["x-postmark-server-token"] = apiKey;
  const payload = provider === "resend"
    ? { from, to: [recipient], subject: email.subject, text: email.text, html: email.html }
    : { From: from, To: recipient, Subject: email.subject, TextBody: email.text, HtmlBody: email.html, TrackOpens: false, TrackLinks: "None" };
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Email provider request failed with status ${response.status}`);
}
