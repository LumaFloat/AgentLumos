import type { AnimationSpeed, LedName, LedSelector, LockState, LumosAnimationConfig, RenderStep } from "../types";

const SPEED_MULTIPLIERS: Record<AnimationSpeed, number> = {
  slow: 1.35,
  normal: 1,
  fast: 0.75,
  urgent: 0.55,
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

function scaleMs(value: number, speed: AnimationSpeed): number {
  return Math.max(0, Math.round(value * SPEED_MULTIPLIERS[speed]));
}

export function getAnimationDurationMs(
  animation: LumosAnimationConfig,
  speed: AnimationSpeed = "normal",
): number {
  return animation.steps.reduce((total, step) => total + scaleMs(step.onMs, speed) + scaleMs(step.offMs, speed), 0);
}

export function buildAnimationSteps(
  animation: LumosAnimationConfig,
  configuredLeds: readonly LedName[],
  speed: AnimationSpeed = "normal",
): RenderStep[] {
  const steps: RenderStep[] = [];
  let atMs = 0;

  for (const sequenceStep of animation.steps) {
    steps.push({ atMs, values: setLedGroup(resolveLedSelectors(sequenceStep.leds, configuredLeds), configuredLeds) });
    atMs += scaleMs(sequenceStep.onMs, speed);
    steps.push({ atMs, values: setLedGroup([], configuredLeds) });
    atMs += scaleMs(sequenceStep.offMs, speed);
  }

  return compactSteps(steps, configuredLeds);
}
