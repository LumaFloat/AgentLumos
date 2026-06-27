import type { LockState, LumosStatus, LedName } from "../types";

export function createIdleStatus(driverName: string, configuredLeds: readonly LedName[]): LumosStatus {
  return {
    daemon: "running",
    state: "idle",
    kind: null,
    configuredLeds: [...configuredLeds],
    activeAnimation: null,
    ttlRemainingMs: null,
    effectSuppressed: false,
    pendingReminder: false,
    originalLockStateCaptured: false,
    driver: driverName,
    lastError: null,
  };
}

export function cloneLockState(state: LockState): LockState {
  return { ...state };
}
