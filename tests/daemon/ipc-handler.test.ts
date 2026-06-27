import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handleDaemonRequest } from "../../src/daemon/ipc-handler";
import { getDefaultConfig, saveConfig } from "../../src/config/config";
import type { LumosStatus } from "../../src/types";

const config = getDefaultConfig();

const status: LumosStatus = {
  daemon: "running",
  state: "idle",
  kind: null,
  configuredLeds: ["caps", "num", "scroll"],
  activeAnimation: null,
  ttlRemainingMs: null,
  effectSuppressed: false,
  pendingReminder: false,
  originalLockStateCaptured: false,
  driver: "fake",
  lastError: null,
};

describe("handleDaemonRequest", () => {
  it("dispatches state requests to the daemon with resolved visual profiles", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const calls: Array<[string, unknown]> = [];
    const response = await handleDaemonRequest(
      {
        setState: async (state, animationName, animation, speed, configuredLeds, ttlMs) => {
          calls.push(["setState", { state, animationName, animation, speed, configuredLeds, ttlMs }]);
        },
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      {
        type: "setState",
        state: "working",
        ttlMs: 5_000,
        overrides: { leds: ["num"] },
      },
    );

    expect(response).toEqual({ ok: true });
    expect(calls).toEqual([
      [
        "setState",
        {
          state: "working",
          animationName: "heartbeat",
          animation: config.animations.heartbeat,
          speed: "slow",
          configuredLeds: ["num"],
          ttlMs: 5000,
        },
      ],
    ]);
  });

  it("allows configured zero ttl for sustained hook states", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const calls: Array<[string, unknown]> = [];
    const response = await handleDaemonRequest(
      {
        setState: async (state, animationName, animation, speed, configuredLeds, ttlMs) => {
          calls.push(["setState", { state, animationName, animation, speed, configuredLeds, ttlMs }]);
        },
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      {
        type: "setState",
        state: "working",
        ttlMs: 0,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(calls).toEqual([
      [
        "setState",
        {
          state: "working",
          animationName: "chase-rider",
          animation: config.animations["chase-rider"],
          speed: "normal",
          configuredLeds: ["num", "caps", "scroll"],
          ttlMs: 0,
        },
      ],
    ]);
  });

  it("dispatches direct LED poke requests", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const calls: Array<[string, unknown]> = [];
    const response = await handleDaemonRequest(
      {
        setState: async () => {},
        pokeLed: async (led) => {
          calls.push(["pokeLed", { led }]);
        },
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      {
        type: "pokeLed",
        led: "scroll",
      },
    );

    expect(response).toEqual({ ok: true });
    expect(calls).toEqual([["pokeLed", { led: "scroll" }]]);
  });

  it("uses state-kind visual profiles when a kind is provided", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const calls: Array<[string, unknown]> = [];
    const response = await handleDaemonRequest(
      {
        setState: async (state, animationName, animation, speed, configuredLeds, ttlMs, kind) => {
          calls.push(["setState", { state, animationName, animation, speed, configuredLeds, ttlMs, kind }]);
        },
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      {
        type: "setState",
        state: "working",
        kind: "command",
        ttlMs: 5_000,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(calls).toEqual([
      [
        "setState",
        {
          state: "working",
          animationName: "scan-pingpong",
          animation: config.animations["scan-pingpong"],
          speed: "fast",
          configuredLeds: ["num", "caps", "scroll"],
          ttlMs: 5000,
          kind: "command",
        },
      ],
    ]);
  });

  it("resolves demo previews through visual profiles with runtime LED overrides", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const calls: Array<[string, unknown]> = [];
    const response = await handleDaemonRequest(
      {
        setState: async (state, animationName, animation, speed, configuredLeds, ttlMs) => {
          calls.push(["setState", { state, animationName, animation, speed, configuredLeds, ttlMs }]);
        },
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      {
        type: "runDemo",
        overrides: { leds: ["caps"] },
        ignoreInputSuppression: true,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(calls[0]).toEqual([
      "setState",
      {
        state: "working",
        animationName: "heartbeat",
        animation: config.animations.heartbeat,
        speed: "slow",
        configuredLeds: ["caps"],
        ttlMs: 3000,
      },
    ]);
    expect(calls.at(-1)).toEqual(["setState", { state: "idle" }]);
  });

  it("returns the daemon status and config", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);

    const response = await handleDaemonRequest(
      {
        setState: async () => {},
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      { type: "getStatus" },
    );

    expect(response).toEqual({ ok: true, data: status });

    const configResponse = await handleDaemonRequest(
      {
        setState: async () => {},
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      { type: "getConfig" },
    );

    expect(configResponse).toEqual({ ok: true, data: config });
  });

  it("resets config to the current defaults", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const response = await handleDaemonRequest(
      {
        setState: async () => {},
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      { type: "resetConfig" },
    );

    expect(response).toEqual({ ok: true, data: { deleted: true, path: configPath } });
  });

  it("accepts daemon shutdown requests", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-ipc-"));
    const configPath = path.join(dir, "config.json");
    saveConfig(config, configPath);
    const response = await handleDaemonRequest(
      {
        setState: async () => {},
        pokeLed: async () => {},
        getStatus: async () => status,
        shutdown: async () => {},
        waitForIdle: async () => {},
      },
      configPath,
      { type: "shutdown" },
    );

    expect(response).toEqual({ ok: true });
  });
});
