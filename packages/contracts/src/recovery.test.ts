import { describe, expect, it } from "vitest";
import { hiddenContactSchema, recoveryCodeSchema, recoveryRequestSchema, recoveryTokenSchema } from "./index.js";

describe("account recovery contracts", () => {
  it("normalizes email addresses before recovery lookup", () => {
    expect(recoveryRequestSchema.parse({ email: "  MEMBER@EXAMPLE.COM " }).email)
      .toBe("member@example.com");
  });

  it("rejects malformed recovery codes and links", () => {
    expect(recoveryCodeSchema.safeParse({ email: "member@example.com", code: "short" }).success).toBe(false);
    expect(recoveryTokenSchema.safeParse({ token: "short" }).success).toBe(false);
  });

  it("normalizes contact emails before creating a hidden-contact blind index", () => {
    expect(hiddenContactSchema.parse({ email: " Friend@Example.com " }).email)
      .toBe("friend@example.com");
  });
});
