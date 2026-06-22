import fs from "node:fs";
import path from "node:path";
import { parseTtlOrZero } from "../core/duration";
import type {
  ActiveLumosState,
  AnimationConfigMap,
  AnimationName,
  HookIntegrationConfig,
  HookIntegrationConfigMap,
  HookIntegrationName,
  LedName,
  LedSelector,
  LumosAnimationConfig,
  LumosConfig,
  LumosState,
  LumosStateConfig,
  SequenceStepConfig,
  StateConfigMap,
} from "../types";

type ConfigDocument = LumosConfig & Record<string, unknown>;
export interface ResetConfigResult {
  deleted: boolean;
  path: string;
}

const ACTIVE_STATES: ActiveLumosState[] = ["active", "blocked", "success", "error"];
const HOOK_INTEGRATIONS: HookIntegrationName[] = ["codex", "claude-code"];
const ANIMATION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const DEFAULT_CONFIG: LumosConfig = {
  leds: ["num", "caps", "scroll"],
  defaultTtl: "30m",
  states: {
    active: { animation: "chase-rider", ttl: "10m" },
    blocked: { animation: "prompt-shift", ttl: "60s" },
    success: { animation: "embrace-confirm", ttl: "10s" },
    error: { animation: "alert-triple", ttl: "20s" },
  },
  animations: {
    "chase-rider": {
      type: "sequence",
      steps: [
        { leds: ["first"], onMs: 180, offMs: 240 },
        { leds: ["middle"], onMs: 180, offMs: 240 },
        { leds: ["last"], onMs: 180, offMs: 1200 },
      ],
    },
    "scan-pingpong": {
      type: "sequence",
      steps: [
        { leds: ["first"], onMs: 140, offMs: 100 },
        { leds: ["middle"], onMs: 140, offMs: 100 },
        { leds: ["last"], onMs: 140, offMs: 100 },
        { leds: ["middle"], onMs: 140, offMs: 700 },
      ],
    },
    "prompt-shift": {
      type: "sequence",
      steps: [
        { leds: ["first", "middle"], onMs: 220, offMs: 120 },
        { leds: ["middle", "last"], onMs: 220, offMs: 520 },
      ],
    },
    "embrace-confirm": {
      type: "sequence",
      steps: [
        { leds: ["edges"], onMs: 280, offMs: 140 },
        { leds: ["middle"], onMs: 360, offMs: 140 },
        { leds: ["edges"], onMs: 280, offMs: 140 },
        { leds: ["middle"], onMs: 360, offMs: 1600 },
      ],
    },
    "alert-triple": {
      type: "sequence",
      steps: [
        { leds: ["all"], onMs: 120, offMs: 100 },
        { leds: ["all"], onMs: 120, offMs: 100 },
        { leds: ["all"], onMs: 120, offMs: 900 },
      ],
    },
  },
  hookIntegrations: {
    codex: {
      enabled: false,
      hooks: {
        SessionStart: "active",
        UserPromptSubmit: "active",
        PreToolUse: "active",
        PostToolUse: "active",
        PermissionRequest: "blocked",
        Stop: "success",
      },
    },
    "claude-code": {
      enabled: false,
      hooks: {
        SessionStart: "active",
        UserPromptSubmit: "active",
        PreToolUse: "active",
        PostToolUseFailure: "error",
        PermissionRequest: "blocked",
        Notification: "blocked",
        Stop: "success",
        StopFailure: "error",
        SessionEnd: "idle",
      },
    },
  },
};

export function getDefaultConfig(): LumosConfig {
  return cloneConfig(DEFAULT_CONFIG);
}

export function getConfigPath(appData = process.env.APPDATA): string {
  if (!appData) {
    throw new Error("APPDATA is not set.");
  }

  return path.win32.join(appData, "AgentLumos", "config.json");
}

export function loadConfig(filePath = getConfigPath()): ConfigDocument {
  if (!fs.existsSync(filePath)) {
    return cloneDocument(DEFAULT_CONFIG);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${filePath}`);
  }

  return normalizeDocument(parsed);
}

export function saveConfig(config: LumosConfig, filePath = getConfigPath()): ConfigDocument {
  const document = normalizeDocument(config);
  writeDocument(filePath, document);
  return document;
}

export function resetConfig(filePath = getConfigPath()): ResetConfigResult {
  const deleted = fs.existsSync(filePath);
  if (deleted) {
    fs.unlinkSync(filePath);
  }

  return {
    deleted,
    path: filePath,
  };
}

export function applyConfigPatch(
  existing: ConfigDocument,
  patch: Partial<LumosConfig>,
): ConfigDocument {
  const next = {
    ...existing,
    ...patch,
    leds: patch.leds ?? existing.leds,
    defaultTtl: patch.defaultTtl ?? existing.defaultTtl,
    states: patch.states ? mergeStates(existing.states, patch.states) : existing.states,
    animations: patch.animations ? mergeAnimations(existing.animations, patch.animations) : existing.animations,
    hookIntegrations: patch.hookIntegrations
      ? mergeHookIntegrations(existing.hookIntegrations, patch.hookIntegrations)
      : existing.hookIntegrations,
  } as ConfigDocument;

  return normalizeDocument(next);
}

export function updateConfig(
  filePath: string,
  patch: Partial<LumosConfig>,
): ConfigDocument {
  const current = loadConfig(filePath);
  const next = applyConfigPatch(current, patch);
  writeDocument(filePath, next);
  return next;
}

function normalizeDocument(input: unknown): ConfigDocument {
  if (!isPlainObject(input)) {
    throw new Error("Config must be a JSON object.");
  }

  const document = { ...input } as Record<string, unknown>;
  const leds = normalizeLeds(document.leds);
  const defaultTtl = normalizeDefaultTtl(document.defaultTtl);
  const animations = normalizeAnimations(document.animations);
  const states = normalizeStates(document.states, animations);
  const hookIntegrations = normalizeHookIntegrations(document.hookIntegrations);

  return {
    leds,
    defaultTtl,
    states,
    animations,
    hookIntegrations,
  } as ConfigDocument;
}

function normalizeLeds(value: unknown): LedName[] {
  if (value === undefined) {
    return [...DEFAULT_CONFIG.leds];
  }

  if (!Array.isArray(value)) {
    throw new Error("Config leds must be an array.");
  }

  if (value.length === 0) {
    throw new Error("Config leds must include at least one LED: caps, num, or scroll.");
  }

  const leds: LedName[] = [];
  const seen = new Set<LedName>();

  for (const item of value) {
    if (!isLedName(item)) {
      throw new Error(`Invalid LED name: ${String(item)}`);
    }
    if (seen.has(item)) {
      throw new Error(`Duplicate LED name: ${item}`);
    }
    seen.add(item);
    leds.push(item);
  }

  return leds;
}

function normalizeDefaultTtl(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_CONFIG.defaultTtl;
  }

  if (typeof value !== "string") {
    throw new Error("defaultTtl must be a string.");
  }

  parseTtlOrZero(value);
  return value;
}

function normalizeStates(value: unknown, animations: AnimationConfigMap): StateConfigMap {
  if (value === undefined) {
    return cloneStates(DEFAULT_CONFIG.states);
  }

  if (!isPlainObject(value)) {
    throw new Error("states must be a JSON object.");
  }

  const states = value as Record<string, unknown>;
  return ACTIVE_STATES.reduce<StateConfigMap>((normalized, state) => {
    normalized[state] = normalizeStateConfig(state, states[state], animations);
    return normalized;
  }, {} as StateConfigMap);
}

function normalizeStateConfig(
  state: ActiveLumosState,
  value: unknown,
  animations: AnimationConfigMap,
): LumosStateConfig {
  if (value === undefined) {
    return cloneStateConfig(DEFAULT_CONFIG.states[state]);
  }

  if (!isPlainObject(value)) {
    throw new Error(`State config for ${state} must be a JSON object.`);
  }

  const config = value as Record<string, unknown>;
  const animation = normalizeAnimationName(config.animation, `states.${state}.animation`);

  if (!animations[animation]) {
    throw new Error(`Unknown animation for ${state}: ${animation}`);
  }

  return {
    animation,
    ttl: config.ttl === undefined ? undefined : normalizeDefaultTtl(config.ttl),
  };
}

function normalizeAnimations(value: unknown): AnimationConfigMap {
  if (value === undefined) {
    return cloneAnimations(DEFAULT_CONFIG.animations);
  }

  if (!isPlainObject(value)) {
    throw new Error("animations must be a JSON object.");
  }

  const animations = value as Record<string, unknown>;
  const normalized: AnimationConfigMap = {};

  for (const [name, animation] of Object.entries(animations)) {
    const animationName = normalizeAnimationName(name, "animations key");
    normalized[animationName] = normalizeAnimation(animation, animationName);
  }

  return normalized;
}

function normalizeHookIntegrations(value: unknown): HookIntegrationConfigMap {
  if (value === undefined) {
    return cloneHookIntegrations(DEFAULT_CONFIG.hookIntegrations);
  }

  if (!isPlainObject(value)) {
    throw new Error("hookIntegrations must be a JSON object.");
  }

  const integrations = value as Record<string, unknown>;
  return HOOK_INTEGRATIONS.reduce<HookIntegrationConfigMap>((normalized, name) => {
    normalized[name] = normalizeHookIntegration(name, integrations[name]);
    return normalized;
  }, {} as HookIntegrationConfigMap);
}

function normalizeHookIntegration(name: HookIntegrationName, value: unknown): HookIntegrationConfig {
  if (value === undefined) {
    return cloneHookIntegration(DEFAULT_CONFIG.hookIntegrations[name]);
  }

  if (!isPlainObject(value)) {
    throw new Error(`hookIntegrations.${name} must be a JSON object.`);
  }

  const integration = value as Record<string, unknown>;
  return {
    enabled: normalizeBoolean(integration.enabled, `hookIntegrations.${name}.enabled`),
    hooks: normalizeHookMap(integration.hooks, `hookIntegrations.${name}.hooks`),
  };
}

function normalizeHookMap(value: unknown, label: string): Record<string, LumosState> {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  const hooks = value as Record<string, unknown>;
  return Object.entries(hooks).reduce<Record<string, LumosState>>((normalized, [eventName, state]) => {
    if (!eventName) {
      throw new Error(`${label} contains an empty hook event name.`);
    }

    normalized[eventName] = normalizeLumosState(state, `${label}.${eventName}`);
    return normalized;
  }, {});
}

function normalizeAnimation(value: unknown, name: AnimationName): LumosAnimationConfig {
  if (!isPlainObject(value)) {
    throw new Error(`Animation ${name} must be a JSON object.`);
  }

  const animation = value as Record<string, unknown>;
  if (animation.type !== "sequence") {
    throw new Error(`Animation ${name} has invalid type: ${String(animation.type)}`);
  }

  if (!Array.isArray(animation.steps) || animation.steps.length === 0) {
    throw new Error(`Animation ${name} must define at least one step.`);
  }

  return {
    type: "sequence",
    steps: animation.steps.map((step, index) => normalizeSequenceStep(step, `${name}.steps[${index}]`)),
  };
}

function normalizeSequenceStep(value: unknown, label: string): SequenceStepConfig {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  const step = value as Record<string, unknown>;
  return {
    leds: normalizeLedSelectors(step.leds, `${label}.leds`),
    onMs: normalizePositiveInteger(step.onMs, `${label}.onMs`),
    offMs: normalizeNonNegativeInteger(step.offMs, `${label}.offMs`),
  };
}

function normalizeLedSelectors(value: unknown, label: string): LedSelector[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const selectors: LedSelector[] = [];
  const seen = new Set<LedSelector>();

  for (const item of value) {
    if (!isLedSelector(item)) {
      throw new Error(`Invalid LED selector: ${String(item)}`);
    }
    if (seen.has(item)) {
      throw new Error(`Duplicate LED selector: ${item}`);
    }
    seen.add(item);
    selectors.push(item);
  }

  return selectors;
}

function normalizeAnimationName(value: unknown, label: string): AnimationName {
  if (typeof value !== "string" || !ANIMATION_NAME_PATTERN.test(value)) {
    throw new Error(`${label} must be a kebab-case animation name.`);
  }

  return value;
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function normalizeLumosState(value: unknown, label: string): LumosState {
  if (value === "idle" || value === "active" || value === "blocked" || value === "success" || value === "error") {
    return value;
  }

  throw new Error(`${label} must be a valid Lumos state.`);
}

function normalizePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function normalizeNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return value;
}

function mergeStates(existing: StateConfigMap, patch: Partial<StateConfigMap>): StateConfigMap {
  return ACTIVE_STATES.reduce<StateConfigMap>((states, state) => {
    states[state] = {
      ...existing[state],
      ...patch[state],
    };
    return states;
  }, {} as StateConfigMap);
}

function mergeAnimations(existing: AnimationConfigMap, patch: Partial<AnimationConfigMap>): AnimationConfigMap {
  const animations = { ...existing };
  for (const [name, animation] of Object.entries(patch)) {
    if (animation) {
      animations[name] = animation;
    }
  }

  return animations;
}

function mergeHookIntegrations(
  existing: HookIntegrationConfigMap,
  patch: Partial<HookIntegrationConfigMap>,
): HookIntegrationConfigMap {
  return HOOK_INTEGRATIONS.reduce<HookIntegrationConfigMap>((integrations, name) => {
    integrations[name] = {
      ...existing[name],
      ...patch[name],
      hooks: {
        ...existing[name].hooks,
        ...patch[name]?.hooks,
      },
    };
    return integrations;
  }, {} as HookIntegrationConfigMap);
}

function writeDocument(filePath: string, document: ConfigDocument): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function cloneConfig(config: LumosConfig): LumosConfig {
  return {
    leds: [...config.leds],
    defaultTtl: config.defaultTtl,
    states: cloneStates(config.states),
    animations: cloneAnimations(config.animations),
    hookIntegrations: cloneHookIntegrations(config.hookIntegrations),
  };
}

function cloneDocument(config: LumosConfig): ConfigDocument {
  return {
    leds: [...config.leds],
    defaultTtl: config.defaultTtl,
    states: cloneStates(config.states),
    animations: cloneAnimations(config.animations),
    hookIntegrations: cloneHookIntegrations(config.hookIntegrations),
  };
}

function cloneStates(states: StateConfigMap): StateConfigMap {
  return ACTIVE_STATES.reduce<StateConfigMap>((cloned, state) => {
    cloned[state] = cloneStateConfig(states[state]);
    return cloned;
  }, {} as StateConfigMap);
}

function cloneStateConfig(config: LumosStateConfig): LumosStateConfig {
  return {
    animation: config.animation,
    ttl: config.ttl,
  };
}

function cloneAnimations(animations: AnimationConfigMap): AnimationConfigMap {
  const cloned: AnimationConfigMap = {};
  for (const [name, animation] of Object.entries(animations)) {
    cloned[name] = {
      type: animation.type,
      steps: animation.steps.map((step) => ({
        leds: [...step.leds],
        onMs: step.onMs,
        offMs: step.offMs,
      })),
    };
  }

  return cloned;
}

function cloneHookIntegrations(integrations: HookIntegrationConfigMap): HookIntegrationConfigMap {
  return HOOK_INTEGRATIONS.reduce<HookIntegrationConfigMap>((cloned, name) => {
    cloned[name] = cloneHookIntegration(integrations[name]);
    return cloned;
  }, {} as HookIntegrationConfigMap);
}

function cloneHookIntegration(integration: HookIntegrationConfig): HookIntegrationConfig {
  return {
    enabled: integration.enabled,
    hooks: { ...integration.hooks },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLedName(value: unknown): value is LedName {
  return value === "caps" || value === "num" || value === "scroll";
}

function isLedSelector(value: unknown): value is LedSelector {
  return isLedName(value) || value === "first" || value === "middle" || value === "last" || value === "all" || value === "edges";
}
