import fs from "node:fs";
import { mkdtempSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyConfigPatch,
  getConfigPath,
  getDefaultConfig,
  loadConfig,
  resetConfig,
  saveConfig,
  updateConfig,
} from "../../src/config/config";
import type { LumosConfig } from "../../src/types";

const defaultConfig = getDefaultConfig();

describe("config defaults", () => {
  it("provides the V0.5 state-kind default config", () => {
    expect(defaultConfig).toMatchObject({
      leds: ["num", "caps", "scroll"],
      defaultTtl: "30m",
      states: {
        working: { ttl: "10m" },
        blocked: { ttl: "60s" },
        success: { ttl: "10s" },
        error: { ttl: "20s" },
      },
      visualProfiles: {
        working: {
          oneLed: { animation: "heartbeat", speed: "slow" },
          twoLed: { animation: "chase-pair", speed: "normal" },
          threeLed: { animation: "chase-rider", speed: "normal" },
        },
        "working.command": {
          oneLed: { animation: "heartbeat", speed: "normal" },
          twoLed: { animation: "chase-pair", speed: "fast" },
          threeLed: { animation: "scan-pingpong", speed: "fast" },
        },
        blocked: {
          oneLed: { animation: "double-blink", speed: "normal" },
          twoLed: { animation: "blocked-pair", speed: "normal" },
          threeLed: { animation: "prompt-shift", speed: "normal" },
        },
        "blocked.input": {
          oneLed: { animation: "double-blink", speed: "slow" },
          twoLed: { animation: "blocked-pair", speed: "slow" },
          threeLed: { animation: "prompt-shift", speed: "slow" },
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
        "error.critical": {
          oneLed: { animation: "alert-triple", speed: "urgent" },
          twoLed: { animation: "alert-triple", speed: "urgent" },
          threeLed: { animation: "alert-triple", speed: "urgent" },
        },
      },
      animations: {
        heartbeat: { type: "sequence" },
        "double-blink": { type: "sequence" },
        confirm: { type: "sequence" },
        "chase-pair": { type: "sequence" },
        "blocked-pair": { type: "sequence" },
        "confirm-pair": { type: "sequence" },
        "chase-rider": { type: "sequence" },
        "scan-pingpong": { type: "sequence" },
        "prompt-shift": { type: "sequence" },
        "embrace-confirm": { type: "sequence" },
        "alert-triple": { type: "sequence" },
      },
    });
    expect(defaultConfig).not.toHaveProperty("hookIntegrations");
  });
});

describe("config path", () => {
  it("stores config under the Windows APPDATA AgentLumos path", () => {
    expect(getConfigPath("C:\\Users\\sam\\AppData\\Roaming")).toBe(
      "C:\\Users\\sam\\AppData\\Roaming\\AgentLumos\\config.json",
    );
  });
});

describe("config validation", () => {
  it("rejects empty LED lists", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");
    saveConfig(defaultConfig, file);

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          leds: [],
        },
        file,
      ),
    ).toThrow(/at least one LED/i);

    expect(() => applyConfigPatch(loadConfig(file), { leds: [] })).toThrow(/at least one LED/i);
  });

  it("rejects invalid LED names and duplicates", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          leds: ["caps", "caps"] as never,
        },
        file,
      ),
    ).toThrow(/duplicate/i);

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          leds: ["caps", "power"] as never,
        },
        file,
      ),
    ).toThrow(/led/i);
  });

  it("rejects unknown visual profile animation references", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          visualProfiles: {
            ...defaultConfig.visualProfiles,
            working: {
              oneLed: { animation: "missing-animation", speed: "normal" },
              twoLed: { animation: "chase-rider", speed: "normal" },
              threeLed: { animation: "chase-rider", speed: "normal" },
            },
          },
        },
        file,
      ),
    ).toThrow(/unknown animation/i);
  });

  it("rejects missing built-in state-kind visual profiles", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");
    const incompleteProfiles = { ...defaultConfig.visualProfiles };
    delete incompleteProfiles["working.command"];

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          visualProfiles: incompleteProfiles,
        },
        file,
      ),
    ).toThrow(/working\.command/i);
  });

  it("rejects incomplete visual profile layouts and invalid speed values", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          visualProfiles: {
            ...defaultConfig.visualProfiles,
            working: {
              oneLed: { animation: "heartbeat", speed: "slow" },
              twoLed: { animation: "chase-rider", speed: "normal" },
            },
          },
        } as never,
        file,
      ),
    ).toThrow(/threeLed/i);

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          visualProfiles: {
            ...defaultConfig.visualProfiles,
            error: {
              oneLed: { animation: "alert-triple", speed: "turbo" },
              twoLed: { animation: "alert-triple", speed: "normal" },
              threeLed: { animation: "alert-triple", speed: "normal" },
            },
          },
        } as never,
        file,
      ),
    ).toThrow(/slow, normal, fast, urgent/i);
  });

  it("rejects invalid animation names and steps", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          animations: {
            ...defaultConfig.animations,
            "Bad.Name": {
              type: "sequence",
              steps: [{ leds: ["caps"], onMs: 100, offMs: 100 }],
            },
          },
        } as never,
        file,
      ),
    ).toThrow(/kebab-case/i);

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          animations: {
            ...defaultConfig.animations,
        "bad-step": {
              type: "sequence",
              steps: [{ leds: ["caps"], onMs: 0, offMs: 100 }],
            },
          },
        },
        file,
      ),
    ).toThrow(/positive/i);

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          animations: {
            ...defaultConfig.animations,
            "bad-selector": {
              type: "sequence",
              steps: [{ leds: ["left"], onMs: 100, offMs: 100 }],
            },
          },
        } as never,
        file,
      ),
    ).toThrow(/selector/i);
  });

  it("rejects malformed JSON on load", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");
    mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, "{", "utf8");

    expect(() => loadConfig(file)).toThrow(/json/i);
  });

});

describe("config updates", () => {
  it("drops unknown fields when patching and saving", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");
    const initial = {
      ...defaultConfig,
      futureField: {
        nested: true,
      },
    };

    saveConfig(initial, file);
    const updated = updateConfig(file, { defaultTtl: "2h" });

    expect(updated.futureField).toBeUndefined();
    expect(updated.defaultTtl).toBe("2h");
    expect(loadConfig(file).futureField).toBeUndefined();
  });

  it("applies patches using the current config schema", () => {
    const existing = {
      ...defaultConfig,
      futureField: "kept",
    };

    expect(
      applyConfigPatch(existing, { leds: ["caps", "num"] }),
    ).toMatchObject({
      leds: ["caps", "num"],
      states: defaultConfig.states,
      visualProfiles: defaultConfig.visualProfiles,
      animations: defaultConfig.animations,
      defaultTtl: "30m",
    });
    expect(applyConfigPatch(existing, { leds: ["caps", "num"] }).futureField).toBeUndefined();
  });

  it("merges animation and visual profile patches", () => {
    const existing = { ...defaultConfig };

    expect(
      applyConfigPatch(existing, {
        animations: {
          "custom-chase": {
            type: "sequence",
            steps: [{ leds: ["caps"], onMs: 50, offMs: 50 }],
          },
        },
        visualProfiles: {
          working: {
            oneLed: { animation: "custom-chase", speed: "fast" },
            twoLed: { animation: "custom-chase", speed: "fast" },
            threeLed: { animation: "custom-chase", speed: "fast" },
          },
        } as never,
      }),
    ).toMatchObject({
      animations: {
        "custom-chase": {
          type: "sequence",
          steps: [{ leds: ["caps"], onMs: 50, offMs: 50 }],
        },
      },
      visualProfiles: {
        working: {
          oneLed: { animation: "custom-chase", speed: "fast" },
        },
      },
    });
  });

  it("resets a config file to the current defaults", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");
    saveConfig(
      {
        ...defaultConfig,
        animations: {
          ...defaultConfig.animations,
          "custom-chase": {
            type: "sequence",
            steps: [{ leds: ["caps"], onMs: 50, offMs: 50 }],
          },
        },
      } as LumosConfig,
      file,
    );

    const reset = resetConfig(file);

    expect(reset).toEqual({ deleted: true, path: file });
    expect(fs.existsSync(file)).toBe(false);
    expect(loadConfig(file)).toEqual(defaultConfig);
  });

  it("drops removed hook integration fields when patching", () => {
    const existing = {
      ...defaultConfig,
      hookIntegrations: {
        codex: {
          enabled: false,
          hooks: {
            Stop: { state: "success", kind: "turn" },
          },
        },
      },
    } as never;

    const updated = applyConfigPatch(existing, { defaultTtl: "1h" });

    expect(updated).not.toHaveProperty("hookIntegrations");
    expect(updated.defaultTtl).toBe("1h");
  });
});
