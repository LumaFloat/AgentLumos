import type { ActiveLumosState, LumosState, LumosStateKind, LumosStateSignal } from "./types";

export const ACTIVE_LUMOS_STATES: readonly ActiveLumosState[] = ["working", "blocked", "success", "error"];

export const STATE_KIND_OPTIONS: Record<ActiveLumosState, readonly LumosStateKind[]> = {
  working: ["preparing", "thinking", "responding", "tool", "command"],
  blocked: ["permission", "input"],
  success: ["turn", "task"],
  error: ["tool", "command", "critical"],
};

export function isActiveLumosState(value: unknown): value is ActiveLumosState {
  return value === "working" || value === "blocked" || value === "success" || value === "error";
}

export function isLumosState(value: unknown): value is LumosState {
  return value === "idle" || isActiveLumosState(value);
}

export function assertValidStateKind(state: LumosState, kind: unknown, label = "kind"): asserts kind is LumosStateKind | undefined {
  if (kind === undefined) {
    return;
  }

  if (typeof kind !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  if (state === "idle") {
    throw new Error("idle does not support kind.");
  }

  if (!STATE_KIND_OPTIONS[state].includes(kind as LumosStateKind)) {
    throw new Error(`${label} must be valid for state ${state}.`);
  }
}

export function parseStateSignal(value: unknown, label: string): LumosStateSignal {
  if (typeof value === "string") {
    const [rawState, rawKind, extra] = value.split(".");
    if (extra !== undefined) {
      throw new Error(`${label} must be a state or state.kind value.`);
    }

    const state = rawState as LumosState;
    if (!isLumosState(state)) {
      throw new Error(`${label} must be a valid Lumos state.`);
    }

    assertValidStateKind(state, rawKind, `${label}.kind`);
    return rawKind === undefined ? { state } : { state, kind: rawKind };
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const signal = value as Record<string, unknown>;
    if (typeof signal.state !== "string") {
      throw new Error(`${label}.state must be a valid Lumos state.`);
    }

    const state = signal.state as LumosState;
    if (!isLumosState(state)) {
      throw new Error(`${label}.state must be a valid Lumos state.`);
    }

    assertValidStateKind(state, signal.kind, `${label}.kind`);
    return typeof signal.kind === "string" ? { state, kind: signal.kind } : { state };
  }

  throw new Error(`${label} must be a state, state.kind, or state signal object.`);
}

export function formatStateSignal(signal: LumosStateSignal): string {
  return signal.kind ? `${signal.state}.${signal.kind}` : signal.state;
}
