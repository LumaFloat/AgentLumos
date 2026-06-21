import { renderState } from "../core/renderer";
import type { KeyboardDriver } from "../drivers/keyboard/driver";
import type { LedName, LockState, LumosAnimationConfig, LumosState } from "../types";
import { cloneLockState } from "./status";

export interface EffectClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface RunEffectOptions {
  driver: KeyboardDriver;
  state: Exclude<LumosState, "idle">;
  animation: LumosAnimationConfig;
  configuredLeds: readonly LedName[];
  originalLockState: LockState;
  ttlMs?: number;
  clock: EffectClock;
  signal?: AbortSignal;
  isSuppressed?: () => boolean;
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

async function applyStep(
  driver: KeyboardDriver,
  currentState: LockState,
  nextValues: Partial<LockState>,
): Promise<LockState> {
  const nextState = { ...currentState, ...nextValues };
  if (
    nextState.caps === currentState.caps &&
    nextState.num === currentState.num &&
    nextState.scroll === currentState.scroll
  ) {
    return currentState;
  }

  await driver.setState(nextState);
  return nextState;
}

async function playCycle(
  driver: KeyboardDriver,
  clock: EffectClock,
  state: Exclude<LumosState, "idle">,
  animation: LumosAnimationConfig,
  configuredLeds: readonly LedName[],
  originalLockState: LockState,
  signal?: AbortSignal,
  isSuppressed?: () => boolean,
): Promise<void> {
  const steps = renderState({
    state,
    animation,
    configuredLeds,
  });

  let currentState = cloneLockState(originalLockState);
  let previousAtMs = 0;

  for (const step of steps) {
    if (isAborted(signal)) {
      return;
    }

    const delay = step.atMs - previousAtMs;
    if (delay > 0) {
      await clock.sleep(delay);
    }

    if (isAborted(signal)) {
      return;
    }

    if (isSuppressed?.()) {
      previousAtMs = step.atMs;
      continue;
    }

    currentState = await applyStep(driver, currentState, step.values);
    previousAtMs = step.atMs;
  }
}

async function restoreOriginal(
  driver: KeyboardDriver,
  originalLockState: LockState,
): Promise<void> {
  await driver.setState(cloneLockState(originalLockState));
}

export async function runEffectCycle(options: RunEffectOptions): Promise<void> {
  const { driver, state, animation, configuredLeds, originalLockState, clock, signal } = options;

  if (configuredLeds.length === 0) {
    return;
  }

  await playCycle(driver, clock, state, animation, configuredLeds, originalLockState, signal);
}

export async function runEffectLoop(options: RunEffectOptions): Promise<void> {
  const { driver, state, animation, configuredLeds, originalLockState, ttlMs, clock, signal, isSuppressed } = options;

  if (ttlMs === undefined) {
    throw new Error("runEffectLoop requires a ttlMs value.");
  }

  if (ttlMs === 0) {
    while (!isAborted(signal)) {
      await playCycle(driver, clock, state, animation, configuredLeds, originalLockState, signal, isSuppressed);
    }
  } else {
    const endAt = clock.now() + ttlMs;

    while (clock.now() < endAt && !isAborted(signal)) {
      await playCycle(driver, clock, state, animation, configuredLeds, originalLockState, signal, isSuppressed);
    }
  }

  if (isAborted(signal)) {
    return;
  }

  await restoreOriginal(driver, originalLockState);
}
