import { describe, expect, it } from "vitest";
import { roomClientEventSchema } from "./index.js";

const sessionId = "6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b";

describe("room join contract", () => {
  it("accepts a join with or without a room ticket", () => {
    expect(roomClientEventSchema.safeParse({ type: "join", sessionId }).success).toBe(true);
    expect(roomClientEventSchema.safeParse({ type: "join", sessionId, ticket: "x".repeat(43) }).success).toBe(true);
  });

  it("rejects malformed tickets and unknown fields", () => {
    expect(roomClientEventSchema.safeParse({ type: "join", sessionId, ticket: "short" }).success).toBe(false);
    expect(roomClientEventSchema.safeParse({ type: "join", sessionId, ticket: "x".repeat(201) }).success).toBe(false);
    expect(roomClientEventSchema.safeParse({ type: "join", sessionId, userId: sessionId }).success).toBe(false);
  });

  it("does not accept a ticket on other events", () => {
    expect(roomClientEventSchema.safeParse({ type: "message", body: "hello", ticket: "x".repeat(43) }).success).toBe(false);
  });
});
