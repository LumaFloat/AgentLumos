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
});

describe("runEffectLoop", () => {
  it("loops a sustained effect until the ttl elapses and restores the original state", async () => {
    const driver = createFakeKeyboardDriver(original);
    const clock = createManualClock();

    await runEffectLoop({
      driver,
      state: "active",
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
      animation,
      configuredLeds: ["caps", "num"],
      originalLockState: original,
      ttlMs: 0,
      clock,
      signal: controller.signal,
    });

    expect(driver.getWriteHistory().at(-1)).not.toEqual(original);
  });
});
