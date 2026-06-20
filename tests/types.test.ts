import { describe, expect, it } from "vitest";
import type { DaemonRequest, LumosConfig } from "../src/types";

describe("shared types", () => {
  it("allows the default V0.1 config shape", () => {
    const config: LumosConfig = {
      leds: ["num", "caps", "scroll"],
      defaultTtl: "30m",
      states: {
        active: { animation: "chase-rider", ttl: "0" },
        blocked: { animation: "prompt-shift", ttl: "15s" },
        success: { animation: "embrace-confirm", ttl: "8s" },
        error: { animation: "alert-triple", ttl: "12s" },
      },
      animations: {
        "chase-rider": {
          type: "sequence",
          steps: [{ leds: ["first"], onMs: 90, offMs: 120 }],
        },
        "scan-pingpong": {
          type: "sequence",
          steps: [{ leds: ["first", "last"], onMs: 120, offMs: 120 }],
        },
        "prompt-shift": {
          type: "sequence",
          steps: [{ leds: ["first", "middle"], onMs: 220, offMs: 120 }],
        },
        "embrace-confirm": {
          type: "sequence",
          steps: [{ leds: ["edges"], onMs: 280, offMs: 140 }],
        },
        "alert-triple": {
          type: "sequence",
          steps: [{ leds: ["all"], onMs: 120, offMs: 100 }],
        },
      },
      hookIntegrations: {
        codex: {
          enabled: false,
          hooks: {
            SessionStart: "active",
          },
        },
        "claude-code": {
          enabled: false,
          hooks: {
            SessionEnd: "idle",
          },
        },
      },
    };

    expect(config.states.success.ttl).toBe("8s");
  });

  it("allows setState daemon requests", () => {
    const request: DaemonRequest = {
      type: "setState",
      state: "active",
      ttlMs: 30 * 60 * 1000,
      overrides: {
        leds: ["caps", "num"],
        animation: "scan-pingpong",
      },
    };

    expect(request.type).toBe("setState");
  });
});
