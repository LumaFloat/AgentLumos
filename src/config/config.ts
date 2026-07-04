import fs from "node:fs";
import path from "node:path";
import { parseTtlOrZero } from "../core/duration";
import { ACTIVE_LUMOS_STATES, STATE_KIND_OPTIONS } from "../state";
import type {
  ActiveLumosState,
  AnimationConfigMap,
  AnimationName,
  AnimationSpeed,
  LedName,
  LedSelector,
  LumosAnimationConfig,
  LumosConfig,
  LumosStateConfig,
  SequenceStepConfig,
  StateConfigMap,
  VisualProfileConfig,
  VisualProfileKey,
  VisualProfileLayout,
  VisualProfileMap,
} from "../types";

type ConfigDocument = LumosConfig & Record<string, unknown>;
export interface ResetConfigResult {
  deleted: boolean;
  path: string;
}

const ACTIVE_STATES = ACTIVE_LUMOS_STATES;
const ANIMATION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const BASE_VISUAL_PROFILES: Record<ActiveLumosState, VisualProfileConfig> = {
  working: {
    oneLed: { animation: "heartbeat", speed: "slow" },
    twoLed: { animation: "chase-pair", speed: "normal" },
    threeLed: { animation: "chase-rider", speed: "normal" },
  },
  blocked: {
    oneLed: { animation: "double-blink", speed: "normal" },
    twoLed: { animation: "blocked-pair", speed: "normal" },
    threeLed: { animation: "prompt-shift", speed: "normal" },
  },
  success: {
    oneLed: { animation: "confirm", speed: "normal" },
    twoLed: { animation: "confirm-pair", speed: "normal" },
    threeLed: { animation: "embrace-confirm", speed: "normal" },
  },
  error: {
    oneLed: { animation: "alert-triple", speed: "fast" },
    twoLed: { animation: "alert-triple", speed: "normal" },
    threeLed: { animation: "alert-triple", speed: "normal" },
  },
};

const VISUAL_PROFILE_KEYS: readonly VisualProfileKey[] = [
  ...ACTIVE_STATES,
  ...ACTIVE_STATES.flatMap((state) => STATE_KIND_OPTIONS[state].map((kind) => `${state}.${kind}` as VisualProfileKey)),
];

function cloneVisualProfileLiteral(profile: VisualProfileConfig): VisualProfileConfig {
  return {
    oneLed: { ...profile.oneLed },
    twoLed: { ...profile.twoLed },
    threeLed: { ...profile.threeLed },
  };
}

function createDefaultVisualProfiles(): VisualProfileMap {
  return {
    working: cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.working),
    "working.preparing": cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.working),
    "working.thinking": {
      oneLed: { animation: "heartbeat", speed: "slow" },
      twoLed: { animation: "chase-pair", speed: "slow" },
      threeLed: { animation: "chase-rider", speed: "slow" },
    },
    "working.responding": cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.working),
    "working.tool": {
      oneLed: { animation: "heartbeat", speed: "normal" },
      twoLed: { animation: "chase-pair", speed: "fast" },
      threeLed: { animation: "scan-pingpong", speed: "normal" },
    },
    "working.command": {
      oneLed: { animation: "heartbeat", speed: "normal" },
      twoLed: { animation: "chase-pair", speed: "fast" },
      threeLed: { animation: "scan-pingpong", speed: "fast" },
    },
    blocked: cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.blocked),
    "blocked.permission": cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.blocked),
    "blocked.input": {
      oneLed: { animation: "double-blink", speed: "slow" },
      twoLed: { animation: "blocked-pair", speed: "slow" },
      threeLed: { animation: "prompt-shift", speed: "slow" },
    },
    success: cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.success),
    "success.turn": cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.success),
    "success.task": {
      oneLed: { animation: "confirm", speed: "slow" },
      twoLed: { animation: "confirm-pair", speed: "slow" },
      threeLed: { animation: "embrace-confirm", speed: "slow" },
    },
    error: cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.error),
    "error.tool": cloneVisualProfileLiteral(BASE_VISUAL_PROFILES.error),
    "error.command": {
      oneLed: { animation: "alert-triple", speed: "urgent" },
      twoLed: { animation: "alert-triple", speed: "fast" },
      threeLed: { animation: "alert-triple", speed: "fast" },
    },
    "error.critical": {
      oneLed: { animation: "alert-triple", speed: "urgent" },
      twoLed: { animation: "alert-triple", speed: "urgent" },
      threeLed: { animation: "alert-triple", speed: "urgent" },
    },
  };
}

const DEFAULT_CONFIG: LumosConfig = {
  leds: ["num", "caps", "scroll"],
  defaultTtl: "30m",
  states: {
    working: { ttl: "10m" },
    blocked: { ttl: "60s" },
    success: { ttl: "10s" },
    error: { ttl: "20s" },
  },
  visualProfiles: createDefaultVisualProfiles(),
  animations: {
    heartbeat: {
      type: "sequence",
      steps: [{ leds: ["all"], onMs: 180, offMs: 1200 }],
    },
    "double-blink": {
      type: "sequence",
      steps: [
        { leds: ["all"], onMs: 180, offMs: 120 },
        { leds: ["all"], onMs: 180, offMs: 700 },
      ],
    },
    confirm: {
      type: "sequence",
      steps: [{ leds: ["all"], onMs: 500, offMs: 1600 }],
    },
    "chase-pair": {
      type: "sequence",
      steps: [
        { leds: ["first"], onMs: 180, offMs: 240 },
        { leds: ["last"], onMs: 180, offMs: 1200 },
      ],
    },
    "blocked-pair": {
      type: "sequence",
      steps: [
        { leds: ["first"], onMs: 160, offMs: 120 },
        { leds: ["last"], onMs: 160, offMs: 120 },
        { leds: ["first"], onMs: 160, offMs: 120 },
        { leds: ["last"], onMs: 160, offMs: 900 },
      ],
    },
    "confirm-pair": {
      type: "sequence",
      steps: [
        { leds: ["first"], onMs: 160, offMs: 100 },
        { leds: ["last"], onMs: 160, offMs: 120 },
        { leds: ["all"], onMs: 520, offMs: 1500 },
      ],
    },
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
    visualProfiles: patch.visualProfiles
      ? mergeVisualProfiles(existing.visualProfiles, patch.visualProfiles)
      : existing.visualProfiles,
    animations: patch.animations ? mergeAnimations(existing.animations, patch.animations) : existing.animations,
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
  const states = normalizeStates(document.states);
  const visualProfiles = normalizeVisualProfiles(document.visualProfiles, animations);

  return {
    leds,
    defaultTtl,
    states,
    visualProfiles,
    animations,
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

function normalizeStates(value: unknown): StateConfigMap {
  if (value === undefined) {
    return cloneStates(DEFAULT_CONFIG.states);
  }

  if (!isPlainObject(value)) {
    throw new Error("states must be a JSON object.");
  }

  const states = value as Record<string, unknown>;
  return ACTIVE_STATES.reduce<StateConfigMap>((normalized, state) => {
    normalized[state] = normalizeStateConfig(state, states[state]);
    return normalized;
  }, {} as StateConfigMap);
}

function normalizeVisualProfiles(value: unknown, animations: AnimationConfigMap): VisualProfileMap {
  if (value === undefined) {
    return cloneVisualProfiles(DEFAULT_CONFIG.visualProfiles);
  }

  if (!isPlainObject(value)) {
    throw new Error("visualProfiles must be a JSON object.");
  }

  const profiles = value as Record<string, unknown>;
  return VISUAL_PROFILE_KEYS.reduce<VisualProfileMap>((normalized, profileKey) => {
    normalized[profileKey] = normalizeVisualProfile(profileKey, profiles[profileKey], animations);
    return normalized;
  }, {} as VisualProfileMap);
}

function normalizeVisualProfile(
  profileKey: VisualProfileKey,
  value: unknown,
  animations: AnimationConfigMap,
): VisualProfileConfig {
  if (value === undefined) {
    throw new Error(`Missing visual profile: ${profileKey}.`);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Visual profile for ${profileKey} must be a JSON object.`);
  }

  const profile = value as Record<string, unknown>;
  return {
    oneLed: normalizeVisualProfileLayout(profileKey, "oneLed", profile.oneLed, animations),
    twoLed: normalizeVisualProfileLayout(profileKey, "twoLed", profile.twoLed, animations),
    threeLed: normalizeVisualProfileLayout(profileKey, "threeLed", profile.threeLed, animations),
  };
}

function normalizeVisualProfileLayout(
  profileKey: VisualProfileKey,
  layoutName: keyof VisualProfileConfig,
  value: unknown,
  animations: AnimationConfigMap,
): VisualProfileLayout {
  const label = `visualProfiles.${profileKey}.${layoutName}`;
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  const layout = value as Record<string, unknown>;
  const animation = normalizeAnimationName(layout.animation, `${label}.animation`);
  if (!animations[animation]) {
    throw new Error(`Unknown animation for ${label}: ${animation}`);
  }

  return {
    animation,
    speed: normalizeAnimationSpeed(layout.speed, `${label}.speed`),
  };
}

function normalizeStateConfig(
  state: ActiveLumosState,
  value: unknown,
): LumosStateConfig {
  if (value === undefined) {
    return cloneStateConfig(DEFAULT_CONFIG.states[state]);
  }

  if (!isPlainObject(value)) {
    throw new Error(`State config for ${state} must be a JSON object.`);
  }

  const config = value as Record<string, unknown>;
  return {
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

function normalizeAnimationSpeed(value: unknown, label: string): AnimationSpeed {
  if (value === "slow" || value === "normal" || value === "fast" || value === "urgent") {
    return value;
  }

  throw new Error(`${label} must be one of: slow, normal, fast, urgent.`);
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

function mergeVisualProfiles(existing: VisualProfileMap, patch: Partial<VisualProfileMap>): VisualProfileMap {
  return VISUAL_PROFILE_KEYS.reduce<VisualProfileMap>((profiles, profileKey) => {
    profiles[profileKey] = patch[profileKey] ?? existing[profileKey];
    return profiles;
  }, {} as VisualProfileMap);
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
    visualProfiles: cloneVisualProfiles(config.visualProfiles),
    animations: cloneAnimations(config.animations),
  };
}

function cloneDocument(config: LumosConfig): ConfigDocument {
  return {
    leds: [...config.leds],
    defaultTtl: config.defaultTtl,
    states: cloneStates(config.states),
    visualProfiles: cloneVisualProfiles(config.visualProfiles),
    animations: cloneAnimations(config.animations),
  };
}

function cloneVisualProfiles(profiles: VisualProfileMap): VisualProfileMap {
  return VISUAL_PROFILE_KEYS.reduce<VisualProfileMap>((cloned, profileKey) => {
    cloned[profileKey] = cloneVisualProfile(profiles[profileKey]);
    return cloned;
  }, {} as VisualProfileMap);
}

function cloneVisualProfile(profile: VisualProfileConfig): VisualProfileConfig {
  return {
    oneLed: { ...profile.oneLed },
    twoLed: { ...profile.twoLed },
    threeLed: { ...profile.threeLed },
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLedName(value: unknown): value is LedName {
  return value === "caps" || value === "num" || value === "scroll";
}

function isLedSelector(value: unknown): value is LedSelector {
  return isLedName(value) || value === "first" || value === "middle" || value === "last" || value === "all" || value === "edges";
}
