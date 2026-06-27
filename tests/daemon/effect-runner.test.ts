import { describe, expect, it } from "vitest";
import { createFakeKeyboardDriver } from "../../src/drivers/keyboard/fake";
import { runEffectCycle, runEffectLoop } from "../../src/daemon/effect-runner";
import type { LockState, LumosAnimationConfig } from "../../src/types";

function createManualClock() {
  let current = 0;

  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}

const original: LockState = {
  caps: false,
  num: true,
  scroll: false,
};

const animation: LumosAnimationConfig = {
  type: "sequence",
  steps: [
    { leds: ["caps", "num"], onMs: 100, offMs: 100 },
  ],
};

describe("runEffectCycle", () => {
  it("plays one animation cycle", async () => {
    const driver = createFakeKeyboardDriver(original);

    await runEffectCycle({
      driver,
      state: "success",
      animationName: "custom-cycle",
      animation,
      configuredLeds: ["caps", "num"],
      originalLockState: original,
      clock: createManualClock(),
    });

    expect(driver.getWriteHistory()).toEqual([
      { caps: true, num: true, scroll: false },
      { caps: false, num: false, scroll: false },
    ]);
  });

  it("plays the one-LED reduced built-in animation without touching unconfigured LEDs", async () => {
    const originalState: LockState = { caps: false, num: true, scroll: true };
    const driver = createFakeKeyboardDriver(originalState);

    await runEffectCycle({
      driver,
      state: "blocked",
      animationName: "prompt-shift",
      animation: {
        type: "sequence",
        steps: [
          { leds: ["first", "middle"], onMs: 220, offMs: 120 },
          { leds: ["middle", "last"], onMs: 220, offMs: 520 },
        ],
      },
      configuredLeds: ["caps"],
      originalLockState: originalState,
      clock: createManualClock(),
    });

    expect(driver.getWriteHistory()).toEqual([
      { caps: true, num: true, scroll: true },
      { caps: false, num: true, scroll: true },
      { caps: true, num: true, scroll: true },
      { caps: false, num: true, scroll: true },
    ]);
  });
});

describe("runEffectLoop", () => {
  it("loops a sustained effect until the ttl elapses and restores the original state", async () => {
    const driver = createFakeKeyboardDriver(original);
    const clock = createManualClock();

    await runEffectLoop({
      driver,
      state: "active",
      animationName: "custom-cycle",
      animation,
      configuredLeds: ["caps", "num"],
      originalLockState: original,
      ttlMs: 500,
      clock,
    });

    expect(driver.getWriteHistory().at(-1)).toEqual(original);
    expect(driver.getWriteHistory().length).toBeGreaterThan(3);
  });

  it("does not write animation steps when no LEDs are configured", async () => {
    const driver = createFakeKeyboardDriver(original);

    await runEffectLoop({
      driver,
      state: "active",
      animationName: "custom-cycle",
      animation,
      configuredLeds: [],
      originalLockState: original,
      ttlMs: 2_000,
      clock: createManualClock(),
    });

    expect(driver.getWriteHistory()).toEqual([original]);
  });

  it("does not restore the original state when aborted by a replacement", async () => {
    const driver = createFakeKeyboardDriver(original);
    const controller = new AbortController();
    const clock = {
      now: () => 0,
      sleep: async () => {
        controller.abort();
      },
    };

    await runEffectLoop({
      driver,
      state: "active",
      animationName: "custom-cycle",
      animation,
      configuredLeds: ["caps", "num"],
      originalLockState: original,
      ttlMs: 0,
      clock,
      signal: controller.signal,
    });

    expect(driver.getWriteHistory().at(-1)).not.toEqual(original);
  });

  it("plays the requested two-LED animation and restores the original full lock state", async () => {
    const originalState: LockState = { caps: false, num: true, scroll: true };
    const driver = createFakeKeyboardDriver(originalState);

    await runEffectLoop({
      driver,
      state: "success",
      animationName: "embrace-confirm",
      animation: {
        type: "sequence",
        steps: [
          { leds: ["edges"], onMs: 280, offMs: 140 },
          { leds: ["middle"], onMs: 360, offMs: 140 },
          { leds: ["edges"], onMs: 280, offMs: 140 },
          { leds: ["middle"], onMs: 360, offMs: 1600 },
        ],
      },
      configuredLeds: ["caps", "num"],
      originalLockState: originalState,
      ttlMs: 500,
      clock: createManualClock(),
    });

    expect(driver.getWriteHistory()).toEqual([
      { caps: true, num: true, scroll: true },
      { caps: false, num: false, scroll: true },
      { caps: true, num: false, scroll: true },
      { caps: false, num: false, scroll: true },
      { caps: true, num: true, scroll: true },
      { caps: false, num: false, scroll: true },
      { caps: true, num: false, scroll: true },
      { caps: false, num: false, scroll: true },
      originalState,
    ]);
  });
});
