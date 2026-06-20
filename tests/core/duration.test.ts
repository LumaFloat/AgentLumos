import { describe, expect, it } from "vitest";
import { parseTtl, parseTtlOrZero } from "../../src/core/duration";

describe("parseTtl", () => {
  it("parses second, minute, and hour TTL strings", () => {
    expect(parseTtl("5")).toBe(5_000);
    expect(parseTtl("5s")).toBe(5_000);
    expect(parseTtl("30m")).toBe(1_800_000);
    expect(parseTtl("2h")).toBe(7_200_000);
  });

  it("accepts the minimum and maximum TTL values", () => {
    expect(parseTtl("1s")).toBe(1_000);
    expect(parseTtl("24h")).toBe(86_400_000);
  });

  it("rejects TTL values outside the supported range", () => {
    expect(() => parseTtl("0s")).toThrow(/1s/i);
    expect(() => parseTtl("25h")).toThrow(/24h/i);
  });

  it("rejects malformed TTL strings", () => {
    expect(() => parseTtl("5x")).toThrow(/ttl/i);
    expect(() => parseTtl("5 m")).toThrow(/ttl/i);
  });

  it("accepts zero as an infinite ttl when explicitly allowed", () => {
    expect(parseTtlOrZero("0")).toBe(0);
  });
});
