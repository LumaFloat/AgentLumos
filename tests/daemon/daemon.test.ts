import { describe, expect, it } from "vitest";
import { createLumosDaemon } from "../../src/daemon/daemon";
import { createFakeKeyboardDriver } from "../../src/drivers/keyboard/fake";
import type { InputActivityMonitorStartOptions } from "../../src/drivers/input/activity-monitor";
import type { LockState, LumosAnimationConfig } from "../../src/types";

function createControlledClock() {
  let current = 0;
  const sleepers: Array<{ wakeAt: number; resolve: () => void }> = [];

  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
  }

  return {
    now: () => current,
    sleep(ms: number) {
      return new Promise<void>((resolve) => {
        sleepers.push({ wakeAt: current + ms, resolve });
      });
    },
    async advance(ms: number) {
      const target = current + ms;

      while (true) {
        sleepers.sort((left, right) => left.wakeAt - right.wakeAt);
        const next = sleepers[0];
        if (!next || next.wakeAt > target) {
          current = target;
          await flush();
          return;
        }

        sleepers.shift();
        current = next.wakeAt;
        next.resolve();
        await flush();
      }
    },
    flush,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function createManualInputActivityMonitor() {
  const starts: InputActivityMonitorStartOptions[] = [];
  const stops: boolean[] = [];

  return {
    monitor: {
      name: "manual-input-activity",
      start(options: InputActivityMonitorStartOptions) {
        starts.push(options);
        const stopIndex = stops.length;
        stops.push(false);
        return {
          stop() {
            stops[stopIndex] = true;
          },
        };
      },
    },

    async triggerActivity(index = starts.length - 1) {
      await starts[index]?.onActivity();
    },

    async triggerIdle(index = starts.length - 1) {
      await starts[index]?.onIdle();
    },

    getStartCount() {
      return starts.length;
    },

    getStartOptions(index: number) {
      return starts[index];
    },

    isStopped(index: number) {
      return stops[index] ?? false;
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

const slowAnimation: LumosAnimationConfig = {
  type: "sequence",
  steps: [{ leds: ["caps"], onMs: 5_000, offMs: 5_000 }],
};

describe("createLumosDaemon", () => {
  it("captures the original lock state on the first visible effect and preserves it across updates", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      configuredLeds: ["caps"],
      originalLockStateCaptured: true,
      activeAnimation: "chase-rider",
      ttlRemainingMs: 5_000,
      pendingReminder: false,
    });

    await daemon.setState("blocked", "prompt-shift", animation, ["num"], 5_000);
    expect(daemon.getStatus()).toMatchObject({
      state: "blocked",
      configuredLeds: ["num"],
      originalLockStateCaptured: true,
      activeAnimation: "prompt-shift",
      ttlRemainingMs: 5_000,
      pendingReminder: false,
    });
  });

  it("restores the original state when turned off", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await daemon.setState("idle");
    await daemon.waitForIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      activeAnimation: null,
      originalLockStateCaptured: false,
      pendingReminder: false,
    });
    expect(await driver.readState()).toEqual(original);
  });

  it("applies the default ttl when one is not provided", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      defaultTtlMs: 1_234,
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"]);

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      ttlRemainingMs: 1_234,
      pendingReminder: false,
    });
  });

  it("reports the remaining lease time from the absolute deadline", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 1_000);
    await clock.advance(250);

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      ttlRemainingMs: 750,
    });
  });

  it("renews the active lease when a later active hook arrives", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 1_000);
    await clock.advance(900);
    await daemon.setState("active", "chase-rider", animation, ["caps"], 1_000);

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      ttlRemainingMs: 1_000,
      pendingReminder: false,
    });
  });

  it("keeps success active for its configured ttl", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    await daemon.setState("success", "embrace-confirm", animation, ["caps"], 2_000);

    expect(daemon.getStatus()).toMatchObject({
      state: "success",
      activeAnimation: "embrace-confirm",
      ttlRemainingMs: 2_000,
      pendingReminder: false,
    });
  });

  it("records driver failures and stays reachable", async () => {
    const clock = createControlledClock();
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
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await clock.advance(100);
    await daemon.waitForIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      lastError: "write failed",
      pendingReminder: false,
    });
  });

  it("keeps zero-led states coherent without visible driver writes", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: [],
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, [], 5_000);

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      activeAnimation: null,
      originalLockStateCaptured: false,
      ttlRemainingMs: 5_000,
      pendingReminder: false,
    });
    expect(driver.getWriteHistory()).toEqual([]);
  });

  it("expires zero-led finite states without leaving a pending reminder", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: [],
      clock,
    });

    await daemon.setState("blocked", "prompt-shift", animation, [], 1_000);
    await clock.advance(1_001);

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      pendingReminder: false,
      effectSuppressed: false,
    });
    expect(driver.getWriteHistory()).toEqual([]);
  });

  it("toggles a single lock LED for direct hardware testing", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
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

  it("temporarily suppresses the visible effect on keyboard activity without clearing logical state", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await inputActivity.triggerActivity();

    expect(daemon.getStatus()).toMatchObject({
      state: "active",
      activeAnimation: "chase-rider",
      effectSuppressed: true,
      originalLockStateCaptured: true,
      pendingReminder: false,
    });
    expect(await driver.readState()).toEqual(original);
  });

  it("preserves suppression when a later hook replaces the current state", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("error", "alert-triple", animation, ["caps"], 20_000);
    await inputActivity.triggerActivity();
    await daemon.setState("success", "embrace-confirm", animation, ["caps"], 10_000);

    expect(daemon.getStatus()).toMatchObject({
      state: "success",
      activeAnimation: "embrace-confirm",
      effectSuppressed: true,
      pendingReminder: false,
    });
    expect(await driver.readState()).toEqual(original);
  });

  it("resumes the visible effect after keyboard input becomes idle", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("blocked", "prompt-shift", animation, ["caps"], 5_000);
    await inputActivity.triggerActivity();
    await inputActivity.triggerIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "blocked",
      activeAnimation: "prompt-shift",
      effectSuppressed: false,
      pendingReminder: false,
    });
  });

  it("clears active when input becomes idle after the lease expired but before the cycle finishes", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("active", "chase-rider", slowAnimation, ["caps"], 1_000);
    await inputActivity.triggerActivity();
    await clock.advance(1_001);
    await inputActivity.triggerIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      activeAnimation: null,
      effectSuppressed: false,
      pendingReminder: false,
    });
    expect(await driver.readState()).toEqual(original);
  });

  it("replays an expired notification from the idle callback even before the cycle finishes", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("error", "alert-triple", slowAnimation, ["caps"], 1_000);
    await inputActivity.triggerActivity();
    await clock.advance(1_001);
    await inputActivity.triggerIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "error",
      activeAnimation: "alert-triple",
      ttlRemainingMs: 5_000,
      effectSuppressed: false,
      pendingReminder: false,
    });
  });

  it("ignores stale keyboard events from a replaced effect", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await daemon.setState("success", "embrace-confirm", animation, ["caps"], 5_000);
    await inputActivity.triggerActivity(0);

    expect(inputActivity.getStartCount()).toBe(2);
    expect(inputActivity.isStopped(0)).toBe(true);
    expect(daemon.getStatus()).toMatchObject({
      state: "success",
      activeAnimation: "embrace-confirm",
      effectSuppressed: false,
      pendingReminder: false,
    });
  });

  it("only ignores Lock keys that participate in the current visible effect", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);

    expect(inputActivity.getStartOptions(0).ignoredLeds).toEqual(["caps"]);
  });

  it("does not let a stale off restore clear a newer state", async () => {
    const clock = createControlledClock();
    const restoreWrite = createDeferred<void>();
    let delayOriginalRestore = false;
    let current = { ...original };
    const driver = {
      name: "delayed-restore",
      async readState() {
        return { ...current };
      },
      async setState(nextState: LockState) {
        if (delayOriginalRestore && nextState.caps === original.caps && nextState.num === original.num && nextState.scroll === original.scroll) {
          await restoreWrite.promise;
        }
        current = { ...nextState };
      },
    };
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    await daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    delayOriginalRestore = true;
    const idle = daemon.setState("idle");
    await clock.flush();
    await daemon.setState("success", "embrace-confirm", animation, ["caps"], 5_000);

    restoreWrite.resolve();
    await idle;

    expect(daemon.getStatus()).toMatchObject({
      state: "success",
      activeAnimation: "embrace-confirm",
      pendingReminder: false,
    });
  });

  it("ignores stale original-state captures from an older startup", async () => {
    const clock = createControlledClock();
    const firstRead = createDeferred<LockState>();
    const firstSnapshot: LockState = { caps: false, num: true, scroll: false };
    const secondSnapshot: LockState = { caps: false, num: false, scroll: true };
    const writes: LockState[] = [];
    let readCount = 0;
    const driver = {
      name: "delayed-read",
      async readState() {
        readCount += 1;
        if (readCount === 1) {
          return firstRead.promise;
        }
        return { ...secondSnapshot };
      },
      async setState(nextState: LockState) {
        writes.push({ ...nextState });
      },
    };
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
    });

    const staleStart = daemon.setState("active", "chase-rider", animation, ["caps"], 5_000);
    await clock.flush();
    const latestStart = daemon.setState("success", "embrace-confirm", animation, ["caps"], 5_000);
    await latestStart;
    firstRead.resolve(firstSnapshot);
    await staleStart;

    expect(daemon.getStatus()).toMatchObject({
      state: "success",
      activeAnimation: "embrace-confirm",
      originalLockStateCaptured: true,
    });

    await daemon.setState("idle");
    expect(writes.at(-1)).toEqual(secondSnapshot);
  });

  it.each([
    ["blocked", "custom-blocked", 5_000],
    ["success", "custom-success", 3_000],
    ["error", "custom-error", 5_000],
  ] as const)("keeps the latest expired %s notification pending while suppressed", async (state, animationName, expectedMinimum) => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState(state, animationName, animation, ["caps"], 1_000);
    await inputActivity.triggerActivity();
    await clock.advance(1_001);

    expect(daemon.getStatus()).toMatchObject({
      state,
      activeAnimation: animationName,
      ttlRemainingMs: 0,
      effectSuppressed: true,
      pendingReminder: true,
    });
    expect(await driver.readState()).toEqual(original);

    await inputActivity.triggerIdle();
    expect(daemon.getStatus()).toMatchObject({
      state,
      activeAnimation: animationName,
      ttlRemainingMs: expectedMinimum,
      effectSuppressed: false,
      pendingReminder: false,
    });
  });

  it("drops stale reminders after five minutes of suppression", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("error", "custom-error", animation, ["caps"], 1_000);
    await inputActivity.triggerActivity();
    await clock.advance(1_001);
    await clock.advance(5 * 60 * 1000 + 1);
    await inputActivity.triggerIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      activeAnimation: null,
      pendingReminder: false,
    });
    expect(await driver.readState()).toEqual(original);
  });

  it("clears pending reminders when the daemon is turned off", async () => {
    const clock = createControlledClock();
    const driver = createFakeKeyboardDriver(original);
    const inputActivity = createManualInputActivityMonitor();
    const daemon = createLumosDaemon({
      driver,
      configuredLeds: ["caps", "num", "scroll"],
      clock,
      inputActivityMonitor: inputActivity.monitor,
    });

    await daemon.setState("blocked", "prompt-shift", animation, ["caps"], 1_000);
    await inputActivity.triggerActivity();
    await clock.advance(1_001);
    await daemon.setState("idle");
    await inputActivity.triggerIdle();

    expect(daemon.getStatus()).toMatchObject({
      state: "idle",
      pendingReminder: false,
      effectSuppressed: false,
    });
    expect(await driver.readState()).toEqual(original);
  });
});
