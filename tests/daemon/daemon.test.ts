import { describe, expect, it } from "vitest";
import { createFakeKeyboardDriver } from "../../src/drivers/keyboard/fake";
import { createLumosDaemon } from "../../src/daemon/daemon";
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
  steps: [{ leds: ["caps"], onMs: 100, offMs: 100 }],
};

describe("createLumosDaemon", () => {
  it("captures the original lock state on the first visible effect and preserves it across updates", async () => {
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock: createManualClock(),
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      configuredLeds: ["caps"],
      originalLockStateCaptured: true,
      activeAnimation: "chase-rider",
    });

    await daemon.setState("blocked", "prompt-shift", animation, ["num"], 5_000);
    expect(daemon.getStatus()).toMatchObject({
      state: "blocked",
      configuredLeds: ["num"],
      originalLockStateCaptured: true,
      activeAnimation: "prompt-shift",
    });
  });

  it("restores the original state when turned off", async () => {
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock: createManualClock(),
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await daemon.setState("idle");
    await daemon.waitForIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      activeAnimation: null,
      originalLockStateCaptured: false,
    });
    expect(await driver.readState()).toEqual(original);
  });

  it("applies the default ttl when one is not provided", async () => {
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      defaultTtlMs: 1_234,
      clock: createManualClock(),
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"]);

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      ttlRemainingMs: 1_234,
    });
  });

  it("keeps success active for its configured ttl", async () => {
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock: createManualClock(),
    });

    await daemon.setState("success", "embrace-confirm", animation, ["caps"], 2_000);

    expect(daemon.getStatus()).toMatchObject({
      state: "success",
      activeAnimation: "embrace-confirm",
      ttlRemainingMs: 2_000,
    });
  });

  it("records driver failures and stays reachable", async () => {
    const driver = {
      async readState() {
        return original;
      },
      async setState() {
        throw new Error("write failed");
      },
    };
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps"],
      clock: createManualClock(),
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await daemon.waitForIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      lastError: "write failed",
    });
  });

  it("keeps zero-led states coherent without visible driver writes", async () => {
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: [],
      clock: createManualClock(),
    });

    await daemon.setState("active", "chase-rider", animation, [], 5_000);

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      activeAnimation: null,
      originalLockStateCaptured: false,
    });
    expect(driver.getWriteHistory()).toEqual([]);
  });

  it("toggles a single lock LED for direct hardware testing", async () => {
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock: createManualClock(),
    });

    await daemon.pokeLed("caps");

    expect(driver.getWriteHistory()).toEqual([
      { caps: true, num: true, scroll: false },
    ]);
    expect(await driver.readState()).toEqual({
      caps: true,
      num: true,
      scroll: false,
    });
  });
});
