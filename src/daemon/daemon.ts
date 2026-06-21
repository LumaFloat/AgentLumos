import type { KeyboardDriver } from "../drivers/keyboard/driver";
import type { InputActivityMonitor, InputActivitySubscription } from "../drivers/input/activity-monitor";
import { createNoopInputActivityMonitor } from "../drivers/input/activity-monitor";
import type { AnimationName, LedName, LockState, LumosAnimationConfig, LumosState, LumosStatus } from "../types";
import { runEffectLoop, type EffectClock } from "./effect-runner";
import { cloneLockState, createIdleStatus } from "./status";

export interface LumosDaemonOptions {
  driver: KeyboardDriver;
  configuredLeds: readonly LedName[];
  defaultTtlMs?: number;
  clock?: EffectClock;
  inputActivityMonitor?: InputActivityMonitor;
  keyboardIdleMs?: number;
  keyboardPollMs?: number;
}

type ActiveState = Exclude<LumosState, "idle">;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createLumosDaemon(options: LumosDaemonOptions) {
  const clock: EffectClock =
    options.clock ?? {
      now: () => Date.now(),
      sleep: (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        }),
    };

  const defaultTtlMs = options.defaultTtlMs ?? 30 * 60 * 1000;
  const inputActivityMonitor = options.inputActivityMonitor ?? createNoopInputActivityMonitor();
  const keyboardIdleMs = options.keyboardIdleMs ?? 3_000;
  const keyboardPollMs = options.keyboardPollMs ?? 50;
  let status = createIdleStatus(options.driver.name ?? "unknown", options.configuredLeds);
  let originalLockState: LockState | null = null;
  let activeController: AbortController | null = null;
  let activeTask: Promise<void> | null = null;
  let inputActivitySubscription: InputActivitySubscription | null = null;
  let effectVersion = 0;

  async function captureOriginalLockState(): Promise<LockState | null> {
    if (originalLockState !== null) {
      return originalLockState;
    }

    originalLockState = cloneLockState(await options.driver.readState());
    status = {
      ...status,
      originalLockStateCaptured: true,
    };
    return originalLockState;
  }

  function clearActiveEffect() {
    stopInputActivityMonitor();
    originalLockState = null;
    status = {
      ...status,
      state: "idle",
      activeAnimation: null,
      ttlRemainingMs: null,
      effectSuppressed: false,
      originalLockStateCaptured: false,
    };
  }

  function stopInputActivityMonitor() {
    inputActivitySubscription?.stop();
    inputActivitySubscription = null;
  }

  async function suppressEffectForKeyboardInput(version: number) {
    if (version !== effectVersion || status.state === "idle" || status.effectSuppressed) {
      return;
    }

    status = {
      ...status,
      effectSuppressed: true,
    };

    if (originalLockState !== null) {
      try {
        await options.driver.setState(cloneLockState(originalLockState));
      } catch (error) {
        status = {
          ...status,
          lastError: toErrorMessage(error),
        };
      }
    }
  }

  function resumeEffectAfterKeyboardIdle(version: number) {
    if (version !== effectVersion || status.state === "idle") {
      return;
    }

    status = {
      ...status,
      effectSuppressed: false,
    };
  }

  function startInputActivityMonitor(version: number, ignoredLeds: readonly LedName[]) {
    stopInputActivityMonitor();
    inputActivitySubscription = inputActivityMonitor.start({
      quietMs: keyboardIdleMs,
      pollMs: keyboardPollMs,
      ignoredLeds,
      onActivity: () => suppressEffectForKeyboardInput(version),
      onIdle: () => resumeEffectAfterKeyboardIdle(version),
    });
  }

  function settleFailure(version: number, error: unknown) {
    if (version !== effectVersion) {
      return;
    }

    stopInputActivityMonitor();
    status = {
      ...status,
      state: "idle",
      activeAnimation: null,
      ttlRemainingMs: null,
      effectSuppressed: false,
      originalLockStateCaptured: false,
      lastError: toErrorMessage(error),
    };
    originalLockState = null;
    activeController = null;
    activeTask = null;
  }

  async function startSustainedEffect(
    state: ActiveState,
    animationName: AnimationName,
    animation: LumosAnimationConfig,
    configuredLeds: readonly LedName[],
    ttlMs: number,
  ) {
    effectVersion += 1;
    const version = effectVersion;

    activeController?.abort();
    stopInputActivityMonitor();

    if (configuredLeds.length === 0) {
      status = {
        ...status,
        state,
        activeAnimation: null,
        ttlRemainingMs: ttlMs,
        effectSuppressed: false,
        originalLockStateCaptured: false,
      };
      return;
    }

    const snapshot = await captureOriginalLockState();
    if (!snapshot) {
      return;
    }

    status = {
      ...status,
      state,
      configuredLeds: [...configuredLeds],
      activeAnimation: animationName,
      ttlRemainingMs: ttlMs,
      effectSuppressed: false,
      lastError: null,
    };

    const controller = new AbortController();
    activeController = controller;
    startInputActivityMonitor(version, configuredLeds);
    activeTask = runEffectLoop({
      driver: options.driver,
      state,
      animation,
      configuredLeds,
      originalLockState: snapshot,
      ttlMs,
      clock,
      signal: controller.signal,
      isSuppressed: () => status.effectSuppressed,
    })
      .then(() => {
        if (version !== effectVersion) {
          return;
        }

        clearActiveEffect();
      })
      .catch((error: unknown) => {
        settleFailure(version, error);
      });
  }

  async function restoreOriginalState() {
    activeController?.abort();
    stopInputActivityMonitor();
    effectVersion += 1;

    if (originalLockState !== null) {
      try {
        await options.driver.setState(cloneLockState(originalLockState));
      } catch (error) {
        status = {
          ...status,
          lastError: toErrorMessage(error),
        };
      }
    }

    clearActiveEffect();
  }

  async function pulseLed(led: LedName) {
    await restoreOriginalState();

    const originalState = cloneLockState(await options.driver.readState());
    const toggledState: LockState = {
      ...originalState,
      [led]: !originalState[led],
    };

    await options.driver.setState(toggledState);
  }

  return {
    async setState(
      state: LumosState,
      animationName?: AnimationName,
      animation?: LumosAnimationConfig,
      configuredLeds: readonly LedName[] = options.configuredLeds,
      ttlMs = defaultTtlMs,
    ) {
      if (state === "idle") {
        await restoreOriginalState();
        return;
      }

      if (!animationName || !animation) {
        throw new Error(`Missing config for state: ${state}`);
      }

      await startSustainedEffect(state, animationName, animation, configuredLeds, ttlMs);
    },

    async pokeLed(led: LedName) {
      await pulseLed(led);
    },

    async shutdown() {
      await restoreOriginalState();
    },

    async waitForIdle() {
      await activeTask;
    },

    getStatus(): LumosStatus {
      return {
        ...status,
        configuredLeds: [...status.configuredLeds],
      };
    },
  };
}
