import { describe, expect, it } from "vitest";
import { renderState } from "../../src/core/renderer";
import type { LumosAnimationConfig } from "../../src/types";

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
        state: "active",
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
        state: "active",
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
        animation: chase,
        configuredLeds: ["caps", "num", "scroll"],
      }),
    ).toEqual([]);
  });

  it("still renders when no LEDs are configured", () => {
    expect(
      renderState({
        state: "active",
        animation: chase,
        configuredLeds: [],
      }),
    ).toEqual([
      { atMs: 0, values: {} },
      { atMs: 90, values: {} },
      { atMs: 210, values: {} },
      { atMs: 300, values: {} },
    ]);
  });

  it("does not write unconfigured Lock LEDs", () => {
    expect(
      renderState({
        state: "active",
        animation: chase,
        configuredLeds: ["caps"],
      }),
    ).toEqual([
      { atMs: 0, values: { caps: true } },
      { atMs: 90, values: { caps: false } },
      { atMs: 210, values: { caps: false } },
      { atMs: 300, values: { caps: false } },
    ]);
  });

  it("resolves position selectors using configured LED order", () => {
    expect(
      renderState({
        state: "active",
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
});
