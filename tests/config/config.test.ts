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
  it("provides the animation-based V0.1 default config", () => {
    expect(defaultConfig).toMatchObject({
      leds: ["num", "caps", "scroll"],
      defaultTtl: "30m",
      states: {
        active: { animation: "chase-rider", ttl: "10m" },
        blocked: { animation: "prompt-shift", ttl: "60s" },
        success: { animation: "embrace-confirm", ttl: "10s" },
        error: { animation: "alert-triple", ttl: "20s" },
      },
      animations: {
        "chase-rider": { type: "sequence" },
        "scan-pingpong": { type: "sequence" },
        "prompt-shift": { type: "sequence" },
        "embrace-confirm": { type: "sequence" },
        "alert-triple": { type: "sequence" },
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
      },
    });
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

  it("rejects unknown animation references", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentlumos-config-"));
    const file = path.join(dir, "config.json");

    expect(() =>
      saveConfig(
        {
          ...defaultConfig,
          states: {
            ...defaultConfig.states,
            active: { animation: "missing-animation" },
          },
        },
        file,
      ),
    ).toThrow(/unknown animation/i);
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

  it("applies V0.1 patches using the current config schema", () => {
    const existing = {
      ...defaultConfig,
      futureField: "kept",
    };

    expect(
      applyConfigPatch(existing, { leds: ["caps", "num"] }),
    ).toMatchObject({
      leds: ["caps", "num"],
      states: defaultConfig.states,
      animations: defaultConfig.animations,
      hookIntegrations: defaultConfig.hookIntegrations,
      defaultTtl: "30m",
    });
    expect(applyConfigPatch(existing, { leds: ["caps", "num"] }).futureField).toBeUndefined();
  });

  it("merges animation and state patches", () => {
    const existing = { ...defaultConfig };

    expect(
      applyConfigPatch(existing, {
        states: {
          active: { animation: "custom-chase", ttl: "10m" },
        } as never,
        animations: {
          "custom-chase": {
            type: "sequence",
            steps: [{ leds: ["caps"], onMs: 50, offMs: 50 }],
          },
        },
      }),
    ).toMatchObject({
      states: {
        active: { animation: "custom-chase", ttl: "10m" },
      },
      animations: {
        "custom-chase": {
          type: "sequence",
          steps: [{ leds: ["caps"], onMs: 50, offMs: 50 }],
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
        states: {
          ...defaultConfig.states,
          active: { animation: "custom-chase", ttl: "10m" },
        },
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

  it("merges hook integration patches", () => {
    const existing = { ...defaultConfig };

    expect(
      applyConfigPatch(existing, {
        hookIntegrations: {
          codex: {
            enabled: true,
            hooks: {
              Stop: "error",
            },
          },
        } as never,
      }),
    ).toMatchObject({
      hookIntegrations: {
        codex: {
          enabled: true,
          hooks: {
            SessionStart: "active",
            Stop: "error",
          },
        },
      },
    });
  });
});
