import { describe, expect, it } from "vitest";
import { getDefaultConfig } from "../../src/config/config";
import { renderState } from "../../src/core/renderer";
import type { AnimationName, LumosAnimationConfig } from "../../src/types";

const defaultConfig = getDefaultConfig();

function stateForAnimation(animationName: AnimationName) {
  switch (animationName) {
    case "chase-rider":
    case "scan-pingpong":
      return "working";
    case "prompt-shift":
    case "blocked-pair":
      return "blocked";
    case "embrace-confirm":
    case "confirm-pair":
      return "success";
    case "alert-triple":
      return "error";
    default:
      return "working";
  }
}

function renderDefault(animationName: AnimationName, configuredLeds = defaultConfig.leds) {
  return renderState({
    state: stateForAnimation(animationName),
    animationName,
    animation: defaultConfig.animations[animationName],
    configuredLeds,
  });
}

const chase: LumosAnimationConfig = {
  type: "sequence",
  steps: [
    { leds: ["caps"], onMs: 90, offMs: 120 },
    { leds: ["num"], onMs: 90, offMs: 900 },
  ],
};

describe("renderState", () => {
  it("renders a sequence animation as ordered LED pulses", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-chase",
        animation: chase,
        configuredLeds: ["caps", "num", "scroll"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: true, num: false, scroll: false } },
      { atMs: 90, values: { caps: false, num: false, scroll: false } },
      { atMs: 210, values: { caps: false, num: true, scroll: false } },
      { atMs: 300, values: { caps: false, num: false, scroll: false } },
    ]);
  });

  it("renders animation steps directly from the animation definition", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-chase",
        animation: chase,
        configuredLeds: ["caps", "num", "scroll"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: true, num: false, scroll: false } },
      { atMs: 90, values: { caps: false, num: false, scroll: false } },
      { atMs: 210, values: { caps: false, num: true, scroll: false } },
      { atMs: 300, values: { caps: false, num: false, scroll: false } },
    ]);
  });

  it("renders idle as no visible output", () => {
    expect(
      renderState({
        state: "idle",
        animationName: "custom-chase",
        animation: chase,
        configuredLeds: ["caps", "num", "scroll"],
      }),
    ).toEqual([]);
  });

  it("still renders when no LEDs are configured", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-chase",
        animation: chase,
        configuredLeds: [],
      }),
    ).toEqual([{ atMs: 0, values: {} }]);
  });

  it("does not write unconfigured Lock LEDs", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-chase",
        animation: chase,
        configuredLeds: ["caps"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: true } },
      { atMs: 90, values: { caps: false } },
    ]);
  });

  it("resolves position selectors using configured LED order", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-position",
        animation: {
          type: "sequence",
          steps: [
            { leds: ["first"], onMs: 90, offMs: 120 },
            { leds: ["middle"], onMs: 90, offMs: 120 },
            { leds: ["last"], onMs: 90, offMs: 120 },
          ],
        },
        configuredLeds: ["num", "caps", "scroll"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: false, num: true, scroll: false } },
      { atMs: 90, values: { caps: false, num: false, scroll: false } },
      { atMs: 210, values: { caps: true, num: false, scroll: false } },
      { atMs: 300, values: { caps: false, num: false, scroll: false } },
      { atMs: 420, values: { caps: false, num: false, scroll: true } },
      { atMs: 510, values: { caps: false, num: false, scroll: false } },
    ]);
  });

  it("resolves all and edges selectors from configured LED order", () => {
    expect(
      renderState({
        state: "blocked",
        animationName: "custom-groups",
        animation: {
          type: "sequence",
          steps: [
            { leds: ["edges"], onMs: 90, offMs: 120 },
            { leds: ["all"], onMs: 90, offMs: 120 },
          ],
        },
        configuredLeds: ["num", "caps", "scroll"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: false, num: true, scroll: true } },
      { atMs: 90, values: { caps: false, num: false, scroll: false } },
      { atMs: 210, values: { caps: true, num: true, scroll: true } },
      { atMs: 300, values: { caps: false, num: false, scroll: false } },
    ]);
  });

  it("preserves the three-LED chase-rider default animation", () => {
    expect(renderDefault("chase-rider")).toEqual([
      { atMs: 0, values: { num: true, caps: false, scroll: false } },
      { atMs: 180, values: { num: false, caps: false, scroll: false } },
      { atMs: 420, values: { num: false, caps: true, scroll: false } },
      { atMs: 600, values: { num: false, caps: false, scroll: false } },
      { atMs: 840, values: { num: false, caps: false, scroll: true } },
      { atMs: 1020, values: { num: false, caps: false, scroll: false } },
    ]);
  });

  it("preserves the three-LED prompt-shift default animation", () => {
    expect(renderDefault("prompt-shift")).toEqual([
      { atMs: 0, values: { num: true, caps: true, scroll: false } },
      { atMs: 220, values: { num: false, caps: false, scroll: false } },
      { atMs: 340, values: { num: false, caps: true, scroll: true } },
      { atMs: 560, values: { num: false, caps: false, scroll: false } },
    ]);
  });

  it("preserves the three-LED embrace-confirm default animation", () => {
    expect(renderDefault("embrace-confirm")).toEqual([
      { atMs: 0, values: { num: true, caps: false, scroll: true } },
      { atMs: 280, values: { num: false, caps: false, scroll: false } },
      { atMs: 420, values: { num: false, caps: true, scroll: false } },
      { atMs: 780, values: { num: false, caps: false, scroll: false } },
      { atMs: 920, values: { num: true, caps: false, scroll: true } },
      { atMs: 1200, values: { num: false, caps: false, scroll: false } },
      { atMs: 1340, values: { num: false, caps: true, scroll: false } },
      { atMs: 1700, values: { num: false, caps: false, scroll: false } },
    ]);
  });

  it("preserves the three-LED alert-triple default animation", () => {
    expect(renderDefault("alert-triple")).toEqual([
      { atMs: 0, values: { num: true, caps: true, scroll: true } },
      { atMs: 120, values: { num: false, caps: false, scroll: false } },
      { atMs: 220, values: { num: true, caps: true, scroll: true } },
      { atMs: 340, values: { num: false, caps: false, scroll: false } },
      { atMs: 440, values: { num: true, caps: true, scroll: true } },
      { atMs: 560, values: { num: false, caps: false, scroll: false } },
    ]);
  });

  it("renders the requested animation without layout-specific replacement", () => {
    expect(renderDefault("chase-rider", ["caps", "num"])).toEqual([
      { atMs: 0, values: { caps: true, num: false } },
      { atMs: 180, values: { caps: false, num: false } },
      { atMs: 420, values: { caps: true, num: false } },
      { atMs: 600, values: { caps: false, num: false } },
      { atMs: 840, values: { caps: false, num: true } },
      { atMs: 1020, values: { caps: false, num: false } },
    ]);
  });

  it("uses left-right motion for the two-LED blocked pair animation", () => {
    expect(renderDefault("blocked-pair", ["caps", "num"])).toEqual([
      { atMs: 0, values: { caps: true, num: false } },
      { atMs: 160, values: { caps: false, num: false } },
      { atMs: 280, values: { caps: false, num: true } },
      { atMs: 440, values: { caps: false, num: false } },
      { atMs: 560, values: { caps: true, num: false } },
      { atMs: 720, values: { caps: false, num: false } },
      { atMs: 840, values: { caps: false, num: true } },
      { atMs: 1000, values: { caps: false, num: false } },
    ]);
  });

  it("uses a sweep-then-hold pattern for the two-LED success pair animation", () => {
    expect(renderDefault("confirm-pair", ["caps", "num"])).toEqual([
      { atMs: 0, values: { caps: true, num: false } },
      { atMs: 160, values: { caps: false, num: false } },
      { atMs: 260, values: { caps: false, num: true } },
      { atMs: 420, values: { caps: false, num: false } },
      { atMs: 540, values: { caps: true, num: true } },
      { atMs: 1060, values: { caps: false, num: false } },
    ]);
  });

  it("scales animation timings with speed", () => {
    expect(
      renderState({
        state: "error",
        animationName: "custom-speed",
        animation: chase,
        speed: "fast",
        configuredLeds: ["caps", "num"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: true, num: false } },
      { atMs: 68, values: { caps: false, num: false } },
      { atMs: 158, values: { caps: false, num: true } },
      { atMs: 226, values: { caps: false, num: false } },
    ]);
  });

  it("does not replace custom one-LED animations, but compacts duplicate physical states", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-one-led",
        animation: {
          type: "sequence",
          steps: [
            { leds: ["first"], onMs: 100, offMs: 100 },
            { leds: ["middle"], onMs: 200, offMs: 300 },
          ],
        },
        configuredLeds: ["caps"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: true } },
      { atMs: 100, values: { caps: false } },
      { atMs: 200, values: { caps: true } },
      { atMs: 400, values: { caps: false } },
    ]);
  });

  it("compacts custom animation steps that resolve to the same physical state", () => {
    expect(
      renderState({
        state: "working",
        animationName: "custom-ignored-led",
        animation: {
          type: "sequence",
          steps: [
            { leds: ["scroll"], onMs: 100, offMs: 100 },
            { leds: ["scroll"], onMs: 100, offMs: 100 },
          ],
        },
        configuredLeds: ["caps"],
      }),
    ).toEqual([{ atMs: 0, values: { caps: false } }]);
  });
});
