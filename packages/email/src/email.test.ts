import { describe, expect, it } from "vitest";
import { renderEmail, type EmailTemplate } from "./index.js";

const templates: EmailTemplate[] = [
  "invite", "welcome", "verification_needed", "session_proposed", "session_cancelled",
  "session_reminder", "session_missed", "unveil_mutual", "new_message", "security_alert",
  "recovery_link", "report_received", "account_deleted"
];

describe("email templates", () => {
  it("uses a private invitation link without a sender identity", async () => {
    const mail = await renderEmail("invite", "https://velum.example", "opaque-token");
    expect(mail.subject).toBe("You’ve been invited to Velum");
    expect(mail.text).toContain("https://velum.example/invite/opaque-token");
    expect(mail.html).toContain("https://velum.example/invite/opaque-token");
    expect(mail.text).not.toContain("inviter");
  });

  it("keeps generic notification templates free of personal content", async () => {
    const mail = await renderEmail("new_message", "https://velum.example");
    expect(mail.subject).not.toMatch(/@|Alice|score/i);
    expect(mail.text).not.toMatch(/@|Alice|score/i);
    expect(mail.html).not.toMatch(/Alice|score/i);
  });

  it("delivers delayed recovery through a private single-use link", async () => {
    const mail = await renderEmail("recovery_link", "https://velum.example", "opaque-token");
    expect(mail.subject).toBe("A secure account recovery link");
    expect(mail.text).toContain("https://velum.example/recover/opaque-token");
    expect(mail.html).toContain("https://velum.example/recover/opaque-token");
    expect(mail.text).not.toContain("member@example.com");
  });

  it("requires a token for invite and recovery links", async () => {
    await expect(renderEmail("invite", "https://velum.example")).rejects.toThrow();
    await expect(renderEmail("recovery_link", "https://velum.example")).rejects.toThrow();
  });

  it("renders every template without remote images or tracking", async () => {
    for (const template of templates) {
      const mail = await renderEmail(template, "https://velum.example", "opaque-token");
      expect(mail.html).toContain("VELUM");
      expect(mail.html).not.toMatch(/<img/i);
      expect(mail.html).not.toMatch(/<script/i);
    }
  });
});
