import type { LedName, LedSelector, LockState, LumosAnimationConfig, RenderStep } from "../types";

const ALL_LEDS: LedName[] = ["caps", "num", "scroll"];

function setLedGroup(
  activeLeds: readonly LedName[],
): Partial<LockState> {
  const active = new Set(activeLeds);
  return ALL_LEDS.reduce<Partial<LockState>>((values, led) => {
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

export function buildAnimationSteps(
  animation: LumosAnimationConfig,
  configuredLeds: readonly LedName[],
): RenderStep[] {
  const steps: RenderStep[] = [];
  let atMs = 0;

  for (const sequenceStep of animation.steps) {
    steps.push({ atMs, values: setLedGroup(resolveLedSelectors(sequenceStep.leds, configuredLeds)) });
    atMs += sequenceStep.onMs;
    steps.push({ atMs, values: setLedGroup([]) });
    atMs += sequenceStep.offMs;
  }

  return steps;
}
