export type LedName = "caps" | "num" | "scroll";
export type LedSelector = LedName | "first" | "middle" | "last" | "all" | "edges";
export type LumosState = "idle" | "active" | "blocked" | "success" | "error";
export type ActiveLumosState = Exclude<LumosState, "idle">;
export type AnimationType = "sequence";
export type AnimationName = string;
export type HookIntegrationName = "codex" | "claude-code";

export type LockState = Record<LedName, boolean>;

export interface SequenceStepConfig {
  leds: LedSelector[];
  onMs: number;
  offMs: number;
}

export interface LumosAnimationConfig {
  type: "sequence";
  steps: SequenceStepConfig[];
}

export interface LumosStateConfig {
  animation: AnimationName;
  ttl?: string;
}

export type StateConfigMap = Record<ActiveLumosState, LumosStateConfig>;
export type AnimationConfigMap = Record<AnimationName, LumosAnimationConfig>;
export type HookIntegrationMap = Record<string, LumosState>;

export interface HookIntegrationConfig {
  enabled: boolean;
  hooks: HookIntegrationMap;
}

export type HookIntegrationConfigMap = Record<HookIntegrationName, HookIntegrationConfig>;

export interface LumosStateOverride {
  leds?: LedName[];
  animation?: AnimationName;
}

export interface LumosConfig {
  leds: LedName[];
  defaultTtl: string;
  states: StateConfigMap;
  animations: AnimationConfigMap;
  hookIntegrations: HookIntegrationConfigMap;
}

export interface RenderStep {
  atMs: number;
  values: Partial<LockState>;
}

export interface LumosStatus {
  daemon: "running";
  state: LumosState;
  configuredLeds: LedName[];
  activeAnimation: AnimationName | null;
  ttlRemainingMs: number | null;
  effectSuppressed: boolean;
  originalLockStateCaptured: boolean;
  driver: string;
  lastError: string | null;
}

export type DaemonRequest =
  | { type: "setState"; state: ActiveLumosState | "idle"; ttlMs?: number; overrides?: LumosStateOverride }
  | { type: "pokeLed"; led: LedName }
  | { type: "getStatus" }
  | { type: "getConfig" }
  | { type: "setConfig"; patch: Partial<LumosConfig> }
  | { type: "resetConfig" }
  | { type: "shutdown" }
  | { type: "runDemo" };

export type DaemonResponse =
  | { ok: true; warning?: string; data?: unknown }
  | { ok: false; code: string; message: string };
