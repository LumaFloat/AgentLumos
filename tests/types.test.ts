import { describe, expect, it } from "vitest";
import type { DaemonRequest, LumosConfig } from "../src/types";

describe("shared types", () => {
  it("allows the default V0.4 config shape", () => {
    const config: LumosConfig = {
      leds: ["num", "caps", "scroll"],
      defaultTtl: "30m",
      states: {
        active: { ttl: "10m" },
        blocked: { ttl: "60s" },
        success: { ttl: "10s" },
        error: { ttl: "20s" },
      },
      visualProfiles: {
        active: {
          oneLed: { animation: "heartbeat", speed: "slow" },
          twoLed: { animation: "chase-pair", speed: "normal" },
          threeLed: { animation: "chase-rider", speed: "normal" },
        },
        blocked: {
          oneLed: { animation: "double-blink", speed: "normal" },
          twoLed: { animation: "double-blink", speed: "normal" },
          threeLed: { animation: "prompt-shift", speed: "normal" },
        },
        success: {
          oneLed: { animation: "confirm", speed: "normal" },
          twoLed: { animation: "confirm", speed: "normal" },
          threeLed: { animation: "embrace-confirm", speed: "normal" },
        },
        error: {
          oneLed: { animation: "alert-triple", speed: "fast" },
          twoLed: { animation: "alert-triple", speed: "normal" },
          threeLed: { animation: "alert-triple", speed: "normal" },
        },
      },
      animations: {
        heartbeat: {
          type: "sequence",
          steps: [{ leds: ["all"], onMs: 180, offMs: 1200 }],
        },
        "double-blink": {
          type: "sequence",
          steps: [{ leds: ["all"], onMs: 180, offMs: 120 }],
        },
        confirm: {
          type: "sequence",
          steps: [{ leds: ["all"], onMs: 500, offMs: 1600 }],
        },
        "chase-pair": {
          type: "sequence",
          steps: [{ leds: ["first"], onMs: 180, offMs: 240 }],
        },
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

    expect(config.states.success.ttl).toBe("10s");
  });

  it("allows setState daemon requests", () => {
    const request: DaemonRequest = {
      type: "setState",
      state: "active",
      ttlMs: 30 * 60 * 1000,
      overrides: {
        leds: ["caps", "num"],
      },
    };

    expect(request.type).toBe("setState");
  });
});
