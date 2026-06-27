import type { AnimationName, AnimationSpeed, LedName, LumosAnimationConfig, LumosState, RenderStep } from "../types";
import { buildAnimationSteps } from "./patterns";

export interface RenderStateInput {
  state: LumosState;
  animationName: AnimationName;
  animation: LumosAnimationConfig;
  speed?: AnimationSpeed;
  configuredLeds: readonly LedName[];
}

export function renderState(input: RenderStateInput): RenderStep[] {
  if (input.state === "idle") {
    return [];
  }

  return buildAnimationSteps(input.animation, input.configuredLeds, input.speed ?? "normal");
}
