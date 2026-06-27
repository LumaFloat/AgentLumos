export type LedName = "caps" | "num" | "scroll";
export type LedSelector = LedName | "first" | "middle" | "last" | "all" | "edges";
export type LumosState = "idle" | "working" | "blocked" | "success" | "error";
export type ActiveLumosState = Exclude<LumosState, "idle">;
export type LumosStateKind =
  | "preparing"
  | "thinking"
  | "responding"
  | "tool"
  | "command"
  | "permission"
  | "input"
  | "turn"
  | "task"
  | "critical";
export type AnimationType = "sequence";
export type AnimationName = string;
export type AnimationSpeed = "slow" | "normal" | "fast" | "urgent";
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
  ttl?: string;
}

export interface VisualProfileLayout {
  animation: AnimationName;
  speed: AnimationSpeed;
}

export interface VisualProfileConfig {
  oneLed: VisualProfileLayout;
  twoLed: VisualProfileLayout;
  threeLed: VisualProfileLayout;
}

export type StateConfigMap = Record<ActiveLumosState, LumosStateConfig>;
export type AnimationConfigMap = Record<AnimationName, LumosAnimationConfig>;
export type VisualProfileKey = string;
export type VisualProfileMap = Record<VisualProfileKey, VisualProfileConfig>;

export interface LumosStateSignal {
  state: LumosState;
  kind?: LumosStateKind;
}

export type HookIntegrationMap = Record<string, LumosStateSignal>;

export interface HookIntegrationConfig {
  enabled: boolean;
  hooks: HookIntegrationMap;
}

export type HookIntegrationConfigMap = Record<HookIntegrationName, HookIntegrationConfig>;

export interface LumosStateOverride {
  leds?: LedName[];
}

export interface LumosConfig {
  leds: LedName[];
  defaultTtl: string;
  states: StateConfigMap;
  visualProfiles: VisualProfileMap;
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
  kind: LumosStateKind | null;
  configuredLeds: LedName[];
  activeAnimation: AnimationName | null;
  ttlRemainingMs: number | null;
  effectSuppressed: boolean;
  pendingReminder: boolean;
  originalLockStateCaptured: boolean;
  driver: string;
  lastError: string | null;
}

export type DaemonRequest =
  | { type: "setState"; state: ActiveLumosState | "idle"; kind?: LumosStateKind; ttlMs?: number; overrides?: LumosStateOverride; ignoreInputSuppression?: boolean }
  | { type: "pokeLed"; led: LedName }
  | { type: "getStatus" }
  | { type: "getConfig" }
  | { type: "setConfig"; patch: Partial<LumosConfig> }
  | { type: "resetConfig" }
  | { type: "shutdown" }
  | { type: "runDemo"; overrides?: LumosStateOverride; ignoreInputSuppression?: boolean };

export type DaemonResponse =
  | { ok: true; warning?: string; data?: unknown }
  | { ok: false; code: string; message: string };
