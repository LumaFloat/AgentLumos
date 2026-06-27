import type { AnimationName, LedName, LedSelector, LockState, LumosAnimationConfig, RenderStep } from "../types";

const BUILT_IN_ANIMATION_NAMES = new Set<AnimationName>([
  "chase-rider",
  "scan-pingpong",
  "prompt-shift",
  "embrace-confirm",
  "alert-triple",
]);

const ONE_LED_REDUCED_ANIMATIONS: Record<AnimationName, LumosAnimationConfig> = {
  "chase-rider": {
    type: "sequence",
    steps: [{ leds: ["all"], onMs: 180, offMs: 1200 }],
  },
  "scan-pingpong": {
    type: "sequence",
    steps: [{ leds: ["all"], onMs: 180, offMs: 1200 }],
  },
  "prompt-shift": {
    type: "sequence",
    steps: [
      { leds: ["all"], onMs: 180, offMs: 120 },
      { leds: ["all"], onMs: 180, offMs: 700 },
    ],
  },
  "embrace-confirm": {
    type: "sequence",
    steps: [{ leds: ["all"], onMs: 500, offMs: 1600 }],
  },
  "alert-triple": {
    type: "sequence",
    steps: [
      { leds: ["all"], onMs: 120, offMs: 100 },
      { leds: ["all"], onMs: 120, offMs: 100 },
      { leds: ["all"], onMs: 120, offMs: 900 },
    ],
  },
};

const TWO_LED_REDUCED_ANIMATIONS: Record<AnimationName, LumosAnimationConfig> = {
  "chase-rider": {
    type: "sequence",
    steps: [
      { leds: ["first"], onMs: 180, offMs: 240 },
      { leds: ["last"], onMs: 180, offMs: 1200 },
    ],
  },
  "scan-pingpong": {
    type: "sequence",
    steps: [
      { leds: ["first"], onMs: 180, offMs: 240 },
      { leds: ["last"], onMs: 180, offMs: 1200 },
    ],
  },
  "prompt-shift": {
    type: "sequence",
    steps: [
      { leds: ["all"], onMs: 180, offMs: 120 },
      { leds: ["all"], onMs: 180, offMs: 700 },
    ],
  },
  "embrace-confirm": {
    type: "sequence",
    steps: [{ leds: ["all"], onMs: 500, offMs: 1600 }],
  },
  "alert-triple": {
    type: "sequence",
    steps: [
      { leds: ["all"], onMs: 120, offMs: 100 },
      { leds: ["all"], onMs: 120, offMs: 100 },
      { leds: ["all"], onMs: 120, offMs: 900 },
    ],
  },
};

function setLedGroup(
  activeLeds: readonly LedName[],
  configuredLeds: readonly LedName[],
): Partial<LockState> {
  const active = new Set(activeLeds);
  return configuredLeds.reduce<Partial<LockState>>((values, led) => {
    values[led] = active.has(led);
    return values;
  }, {});
}

function middleLed(configuredLeds: readonly LedName[]): LedName[] {
  if (configuredLeds.length === 0) {
    return [];
  }

  return [configuredLeds[Math.floor((configuredLeds.length - 1) / 2)]];
}

function edgeLeds(configuredLeds: readonly LedName[]): LedName[] {
  if (configuredLeds.length <= 1) {
    return [...configuredLeds];
  }

  return [configuredLeds[0], configuredLeds[configuredLeds.length - 1]];
}

function resolveLedSelector(selector: LedSelector, configuredLeds: readonly LedName[]): LedName[] {
  switch (selector) {
    case "first":
      return configuredLeds[0] ? [configuredLeds[0]] : [];
    case "middle":
      return middleLed(configuredLeds);
    case "last":
      return configuredLeds[configuredLeds.length - 1] ? [configuredLeds[configuredLeds.length - 1]] : [];
    case "all":
      return [...configuredLeds];
    case "edges":
      return edgeLeds(configuredLeds);
    default:
      return configuredLeds.includes(selector) ? [selector] : [];
  }
}

function resolveLedSelectors(selectors: readonly LedSelector[], configuredLeds: readonly LedName[]): LedName[] {
  const resolved: LedName[] = [];

  for (const selector of selectors) {
    for (const led of resolveLedSelector(selector, configuredLeds)) {
      if (!resolved.includes(led)) {
        resolved.push(led);
      }
    }
  }

  return resolved;
}

function selectAnimationForLayout(
  animationName: AnimationName,
  animation: LumosAnimationConfig,
  configuredLeds: readonly LedName[],
): LumosAnimationConfig {
  if (!BUILT_IN_ANIMATION_NAMES.has(animationName)) {
    return animation;
  }

  if (configuredLeds.length === 1) {
    return ONE_LED_REDUCED_ANIMATIONS[animationName] ?? animation;
  }

  if (configuredLeds.length === 2) {
    return TWO_LED_REDUCED_ANIMATIONS[animationName] ?? animation;
  }

  return animation;
}

function sameValues(
  left: Partial<LockState>,
  right: Partial<LockState>,
  configuredLeds: readonly LedName[],
): boolean {
  return configuredLeds.every((led) => left[led] === right[led]);
}

function compactSteps(steps: readonly RenderStep[], configuredLeds: readonly LedName[]): RenderStep[] {
  const compacted: RenderStep[] = [];

  for (const step of steps) {
    const previous = compacted[compacted.length - 1];
    if (previous && sameValues(previous.values, step.values, configuredLeds)) {
      continue;
    }

    compacted.push(step);
  }

  return compacted;
}

export function buildAnimationSteps(
  animationName: AnimationName,
  animation: LumosAnimationConfig,
  configuredLeds: readonly LedName[],
): RenderStep[] {
  const selectedAnimation = selectAnimationForLayout(animationName, animation, configuredLeds);
  const steps: RenderStep[] = [];
  let atMs = 0;

  for (const sequenceStep of selectedAnimation.steps) {
    steps.push({ atMs, values: setLedGroup(resolveLedSelectors(sequenceStep.leds, configuredLeds), configuredLeds) });
    atMs += sequenceStep.onMs;
    steps.push({ atMs, values: setLedGroup([], configuredLeds) });
    atMs += sequenceStep.offMs;
  }

  return compactSteps(steps, configuredLeds);
}
