import type { KeyboardDriver } from "../drivers/keyboard/driver";
import type { InputActivityMonitor, InputActivitySubscription } from "../drivers/input/activity-monitor";
import { createNoopInputActivityMonitor } from "../drivers/input/activity-monitor";
import type { AnimationName, AnimationSpeed, LedName, LockState, LumosAnimationConfig, LumosState, LumosStateKind, LumosStatus } from "../types";
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

export interface LumosDaemon {
  setState(
    state: LumosState,
    animationName?: AnimationName,
    animation?: LumosAnimationConfig,
    speed?: AnimationSpeed,
    configuredLeds?: readonly LedName[],
    ttlMs?: number,
    kind?: LumosStateKind,
    ignoreInputSuppression?: boolean,
  ): Promise<void>;
  pokeLed(led: LedName): Promise<void>;
  shutdown(): Promise<void>;
  waitForIdle(): Promise<void>;
  getStatus(): LumosStatus;
}

type ActiveState = Exclude<LumosState, "idle">;

interface EffectDescriptor {
  state: ActiveState;
  kind?: LumosStateKind;
  animationName: AnimationName;
  animation: LumosAnimationConfig;
  speed: AnimationSpeed;
  configuredLeds: readonly LedName[];
  ttlMs: number;
  receivedAt: number;
  expiresAt: number | null;
  ignoreInputSuppression: boolean;
}

interface PendingReminder {
  descriptor: EffectDescriptor;
  pendingSince: number;
}

const MAX_PENDING_REMINDER_AGE_MS = 5 * 60 * 1000;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function minimumReminderMs(state: ActiveState): number {
  switch (state) {
    case "blocked":
      return 5_000;
    case "success":
      return 3_000;
    case "error":
      return 5_000;
    case "working":
      return 0;
  }
}

function canDeferReminder(state: ActiveState): boolean {
  return state !== "working";
}

export function createLumosDaemon(options: LumosDaemonOptions): LumosDaemon {
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
  let currentEffect: EffectDescriptor | null = null;
  let pendingReminder: PendingReminder | null = null;

  function getRemainingTtlMs(descriptor: EffectDescriptor | null = currentEffect): number | null {
    if (!descriptor) {
      return null;
    }

    if (descriptor.expiresAt === null) {
      return 0;
    }

    return Math.max(0, descriptor.expiresAt - clock.now());
  }

  function isExpired(descriptor: EffectDescriptor): boolean {
    return descriptor.expiresAt !== null && clock.now() >= descriptor.expiresAt;
  }

  function syncActiveStatus(descriptor: EffectDescriptor, effectSuppressed: boolean, activeAnimation: AnimationName | null): void {
    status = {
      ...status,
      state: descriptor.state,
      kind: descriptor.kind ?? null,
      configuredLeds: [...descriptor.configuredLeds],
      activeAnimation,
      ttlRemainingMs: getRemainingTtlMs(descriptor),
      effectSuppressed,
      pendingReminder: false,
      originalLockStateCaptured: originalLockState !== null,
      lastError: null,
    };
  }

  function syncIdleStatus(extra: Partial<LumosStatus> = {}): void {
    status = {
      ...status,
      state: "idle",
      kind: null,
      configuredLeds: [...options.configuredLeds],
      activeAnimation: null,
      ttlRemainingMs: null,
      effectSuppressed: false,
      pendingReminder: false,
      originalLockStateCaptured: false,
      ...extra,
    };
  }

  function createEffectDescriptor(
    state: ActiveState,
    kind: LumosStateKind | undefined,
    animationName: AnimationName,
    animation: LumosAnimationConfig,
    speed: AnimationSpeed,
    configuredLeds: readonly LedName[],
    ttlMs: number,
    ignoreInputSuppression = false,
  ): EffectDescriptor {
    const receivedAt = clock.now();
    return {
      state,
      kind,
      animationName,
      animation,
      speed,
      configuredLeds: [...configuredLeds],
      ttlMs,
      receivedAt,
      expiresAt: ttlMs === 0 ? null : receivedAt + ttlMs,
      ignoreInputSuppression,
    };
  }

  async function captureOriginalLockState(version: number): Promise<LockState | null> {
    if (originalLockState !== null) {
      return originalLockState;
    }

    const snapshot = cloneLockState(await options.driver.readState());
    if (version !== effectVersion) {
      return null;
    }

    if (originalLockState !== null) {
      return originalLockState;
    }

    originalLockState = snapshot;
    status = {
      ...status,
      originalLockStateCaptured: true,
    };
    return originalLockState;
  }

  function stopInputActivityMonitor(): void {
    inputActivitySubscription?.stop();
    inputActivitySubscription = null;
  }

  function clearActiveEffect(): void {
    stopInputActivityMonitor();
    activeController = null;
    activeTask = null;
    originalLockState = null;
    currentEffect = null;
    pendingReminder = null;
    syncIdleStatus();
  }

  async function suppressEffectForKeyboardInput(version: number): Promise<void> {
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

  async function resumeEffectAfterKeyboardIdle(version: number): Promise<void> {
    if (version !== effectVersion || status.state === "idle") {
      return;
    }

    if (await replayPendingReminder(version)) {
      return;
    }

    if (currentEffect && status.effectSuppressed && isExpired(currentEffect)) {
      if (!canDeferReminder(currentEffect.state)) {
        await restoreOriginalState();
        return;
      }

      pendingReminder = {
        descriptor: currentEffect,
        pendingSince: currentEffect.expiresAt ?? clock.now(),
      };
      activeController?.abort();
      activeController = null;
      activeTask = null;
      status = {
        ...status,
        ttlRemainingMs: 0,
        pendingReminder: true,
      };

      await replayPendingReminder(version);
      return;
    }

    status = {
      ...status,
      effectSuppressed: false,
    };
  }

  function startInputActivityMonitor(version: number, ignoredLeds: readonly LedName[]): void {
    stopInputActivityMonitor();
    inputActivitySubscription = inputActivityMonitor.start({
      quietMs: keyboardIdleMs,
      pollMs: keyboardPollMs,
      ignoredLeds,
      onActivity: () => suppressEffectForKeyboardInput(version),
      onIdle: () => resumeEffectAfterKeyboardIdle(version),
    });
  }

  function settleFailure(version: number, error: unknown): void {
    if (version !== effectVersion) {
      return;
    }

    stopInputActivityMonitor();
    activeController = null;
    activeTask = null;
    currentEffect = null;
    pendingReminder = null;
    originalLockState = null;
    syncIdleStatus({
      lastError: toErrorMessage(error),
    });
  }

  async function replayPendingReminder(version: number): Promise<boolean> {
    if (version !== effectVersion || !pendingReminder) {
      return false;
    }

    const ageMs = clock.now() - pendingReminder.pendingSince;
    if (ageMs > MAX_PENDING_REMINDER_AGE_MS) {
      await restoreOriginalState();
      return true;
    }

    const reminder = pendingReminder.descriptor;
    pendingReminder = null;

    const replayDescriptor = createEffectDescriptor(
      reminder.state,
      reminder.kind,
      reminder.animationName,
      reminder.animation,
      reminder.speed,
      reminder.configuredLeds,
      minimumReminderMs(reminder.state),
      reminder.ignoreInputSuppression,
    );

    await startSustainedEffect(replayDescriptor, false);
    return true;
  }

  async function finishVisibleEffect(version: number, descriptor: EffectDescriptor): Promise<void> {
    if (version !== effectVersion || currentEffect !== descriptor) {
      return;
    }

    if (status.effectSuppressed && canDeferReminder(descriptor.state)) {
      pendingReminder = {
        descriptor,
        pendingSince: clock.now(),
      };
      activeController = null;
      activeTask = null;
      status = {
        ...status,
        ttlRemainingMs: 0,
        pendingReminder: true,
      };
      return;
    }

    clearActiveEffect();
  }

  async function startLeaseOnlyEffect(version: number, descriptor: EffectDescriptor): Promise<void> {
    if (descriptor.ttlMs === 0) {
      activeTask = Promise.resolve();
      return;
    }

    activeTask = clock
      .sleep(descriptor.ttlMs)
      .then(() => {
        if (version !== effectVersion || currentEffect !== descriptor) {
          return;
        }

        clearActiveEffect();
      })
      .catch((error: unknown) => {
        settleFailure(version, error);
      });
  }

  async function startSustainedEffect(descriptor: EffectDescriptor, initiallySuppressed = false): Promise<void> {
    effectVersion += 1;
    const version = effectVersion;

    activeController?.abort();
    stopInputActivityMonitor();
    pendingReminder = null;
    currentEffect = descriptor;

    try {
      if (descriptor.configuredLeds.length === 0) {
        syncActiveStatus(descriptor, initiallySuppressed, null);
        activeController = null;
        await startLeaseOnlyEffect(version, descriptor);
        return;
      }

      const snapshot = await captureOriginalLockState(version);
      if (version !== effectVersion || currentEffect !== descriptor) {
        return;
      }

      if (!snapshot) {
        return;
      }

      syncActiveStatus(descriptor, initiallySuppressed, descriptor.animationName);

      const controller = new AbortController();
      activeController = controller;
      if (!descriptor.ignoreInputSuppression) {
        startInputActivityMonitor(version, descriptor.configuredLeds);
      }
      activeTask = runEffectLoop({
        driver: options.driver,
        state: descriptor.state,
        animationName: descriptor.animationName,
        animation: descriptor.animation,
        speed: descriptor.speed,
        configuredLeds: descriptor.configuredLeds,
        originalLockState: snapshot,
        ttlMs: descriptor.ttlMs,
        clock,
        signal: controller.signal,
        isSuppressed: () => !descriptor.ignoreInputSuppression && status.effectSuppressed,
      })
        .then(async () => {
          await finishVisibleEffect(version, descriptor);
        })
        .catch((error: unknown) => {
          settleFailure(version, error);
        });
    } catch (error) {
      settleFailure(version, error);
    }
  }

  async function restoreOriginalState(): Promise<void> {
    activeController?.abort();
    stopInputActivityMonitor();
    effectVersion += 1;
    const version = effectVersion;
    const snapshot = originalLockState === null ? null : cloneLockState(originalLockState);

    if (snapshot !== null) {
      try {
        await options.driver.setState(snapshot);
      } catch (error) {
        if (version !== effectVersion) {
          return;
        }

        status = {
          ...status,
          lastError: toErrorMessage(error),
        };
      }
    }

    if (version !== effectVersion) {
      return;
    }

    clearActiveEffect();
  }

  async function pulseLed(led: LedName): Promise<void> {
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
      speed: AnimationSpeed = "normal",
      configuredLeds: readonly LedName[] = options.configuredLeds,
      ttlMs = defaultTtlMs,
      kind?: LumosStateKind,
      ignoreInputSuppression = false,
    ): Promise<void> {
      if (state === "idle") {
        await restoreOriginalState();
        return;
      }

      if (!animationName || !animation) {
        throw new Error(`Missing config for state: ${state}`);
      }

      const descriptor = createEffectDescriptor(state, kind, animationName, animation, speed, configuredLeds, ttlMs, ignoreInputSuppression);
      await startSustainedEffect(descriptor, ignoreInputSuppression ? false : status.effectSuppressed);
    },

    async pokeLed(led: LedName): Promise<void> {
      await pulseLed(led);
    },

    async shutdown(): Promise<void> {
      await restoreOriginalState();
    },

    async waitForIdle(): Promise<void> {
      await activeTask;
    },

    getStatus(): LumosStatus {
      return {
        ...status,
        ttlRemainingMs: getRemainingTtlMs(),
        pendingReminder: pendingReminder !== null,
        configuredLeds: [...status.configuredLeds],
      };
    },
  };
}
