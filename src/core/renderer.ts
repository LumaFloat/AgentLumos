import type { LedName, LumosAnimationConfig, LumosState } from "../types";
import { buildAnimationSteps } from "./patterns";

export interface RenderStateInput {
  state: LumosState;
  animation: LumosAnimationConfig;
  configuredLeds: readonly LedName[];
}

export function renderState(input: RenderStateInput) {
  if (input.state === "idle") {
    return [];
  }

  return buildAnimationSteps(input.animation, input.configuredLeds);
}
