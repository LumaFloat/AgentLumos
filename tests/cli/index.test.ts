import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "../../src/cli/index";
import { getDefaultConfig } from "../../src/config/config";
import type { DaemonResponse } from "../../src/types";

function createClientFactory(responses: DaemonResponse[]) {
  const requests: unknown[] = [];

  return {
    requests,
    createClient: () => ({
      async request(request: unknown) {
        requests.push(request);
        const response = responses.shift();
        if (!response) {
          throw new Error("missing response");
        }
        return response;
      },
    }),
  };
}

describe("runCli", () => {
  it("prints a concise error for an unknown command", async () => {
    const stderr: string[] = [];

    const exitCode = await runCli(["ofF"], {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async (chunk: string) => { stderr.push(chunk); } },
    });

    expect(exitCode).toBe(2);
    expect(stderr.join("")).toContain("unknown command");
    expect(stderr.join("")).toContain("ofF");
    expect(stderr.join("")).not.toContain("at ");
  });

  it("prints help when no command is provided", async () => {
    const stdout: string[] = [];

    const exitCode = await runCli([], {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Usage:");
    expect(stdout.join("")).toContain("show");
    expect(stdout.join("")).toContain("set");
  });

  it.each([
    [["help"]],
    [["--help"]],
    [["-h"]],
  ])("prints CLI help for %j", async (argv) => {
    const stdout: string[] = [];

    const exitCode = await runCli(argv, {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Usage:");
    expect(stdout.join("")).toContain("show");
    expect(stdout.join("")).toContain("set");
    expect(stdout.join("")).toContain("hook");
    expect(stdout.join("")).toContain("led");
  });

  it("prints LED diagnostics help", async () => {
    const stdout: string[] = [];

    const exitCode = await runCli(["led", "--help"], {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Diagnose physical LED behavior");
    expect(stdout.join("")).toContain("test");
  });

  it("shows LED overrides for preview help but not state-setting help", async () => {
    const showStdout: string[] = [];
    const showExitCode = await runCli(["show", "--help"], {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { showStdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    const setStdout: string[] = [];
    const setExitCode = await runCli(["set", "--help"], {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { setStdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(showExitCode).toBe(0);
    expect(showStdout.join("")).toContain("--leds <list>");
    expect(setExitCode).toBe(0);
    expect(setStdout.join("")).not.toContain("--leds <list>");
  });

  it.each([
    [["set", "working", "--wat"], "unknown option"],
    [["set", "working", "--leds", "caps"], "unknown option"],
    [["set", "working", "--ttl"], "argument missing"],
    [["set", "working", "--ttl", "5s", "--ttl", "6s"], "Duplicate option: --ttl"],
    [["set", "working", "-k", "permission"], "kind must be valid for state working"],
    [["set", "working", "-k", "unknown"], "kind must be valid for state working"],
    [["show", "working", "-k", "permission"], "kind must be valid for state working"],
    [["show", "working.command", "-k", "tool"], "Duplicate kind"],
    [["show", "demo", "-k", "command"], "Demo preview does not support kind"],
    [["set", "active"], "Invalid state: active"],
    [["show", "idle"], "Invalid state: idle"],
    [["off", "extra"], "too many arguments"],
    [["status", "--json"], "unknown option"],
    [["led", "test", "caps", "num"], "too many arguments"],
    [["test", "caps"], "unknown command"],
    [["poke", "caps"], "unknown command"],
    [["daemon", "stop", "extra"], "too many arguments"],
    [["config", "get", "extra"], "too many arguments"],
    [["hook", "install", "codex", "extra"], "too many arguments"],
  ])("rejects invalid arguments for %j", async (argv, expectedMessage) => {
    const stderr: string[] = [];

    const exitCode = await runCli(argv, {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async (chunk: string) => { stderr.push(chunk); } },
    });

    expect(exitCode).toBe(2);
    expect(stderr.join("")).toContain(expectedMessage);
    expect(stderr.join("")).not.toContain("at ");
  });

  it.each([
    ["input_error", 2],
    ["daemon_error", 4],
    ["ipc_error", 4],
    ["driver_failed", 5],
  ])("maps %s responses to exit code %i", async (code, expectedExitCode) => {
    const stderr: string[] = [];
    const clientFactory = createClientFactory([
      { ok: false, code, message: "request failed" },
    ]);

    const exitCode = await runCli(["status"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async (chunk: string) => { stderr.push(chunk); } },
    });

    expect(exitCode).toBe(expectedExitCode);
    expect(stderr.join("")).toContain("request failed");
  });

  it("prints a concise error when daemon auto-start retries are exhausted", async () => {
    const stderr: string[] = [];

    const exitCode = await runCli(["status"], {
      platform: "win32",
      createClient: () => ({
        async request() {
          const error = new Error("connect ECONNREFUSED");
          (error as { code?: string }).code = "ECONNREFUSED";
          throw error;
        },
      }),
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async (chunk: string) => { stderr.push(chunk); } },
    });

    expect(exitCode).toBe(4);
    expect(stderr.join("")).toContain("connect ECONNREFUSED");
    expect(stderr.join("")).not.toContain("at requestWithAutoStart");
  });

  it.each([
    ["linux", "Linux"],
    ["darwin", "macOS"],
  ] as const)("rejects physical LED commands on %s", async (platform, displayName) => {
    const stderr: string[] = [];

    const exitCode = await runCli(["set", "working"], {
      platform,
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {
        throw new Error("should not spawn");
      },
      stdout: { write: async () => true },
      stderr: { write: async (chunk: string) => { stderr.push(chunk); } },
    });

    expect(exitCode).toBe(3);
    expect(stderr.join("")).toContain(`${displayName} keyboard LED control is not supported yet.`);
    expect(stderr.join("")).toContain("Windows");
  });

  it("keeps help available on unsupported platforms", async () => {
    const stdout: string[] = [];

    const exitCode = await runCli(["help"], {
      platform: "linux",
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {
        throw new Error("should not spawn");
      },
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Usage:");
  });

  it("sends set working as a setState request", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["set", "working"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setState", state: "working", ttlMs: undefined, overrides: undefined },
    ]);
  });

  it("treats ttl zero as an infinite request", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["set", "working", "--ttl", "0"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      {
        type: "setState",
        state: "working",
        ttlMs: 0,
        overrides: undefined,
      },
    ]);
  });

  it("sends state kind in set requests", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["set", "working", "-k", "command"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      {
        type: "setState",
        state: "working",
        kind: "command",
        ttlMs: undefined,
        overrides: undefined,
      },
    ]);
  });

  it("runs the built-in preview sequence with show", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "runDemo", overrides: undefined, ignoreInputSuppression: true }]);
  });

  it("runs the built-in preview sequence with show demo", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show", "demo", "--leds", "caps"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "runDemo", overrides: { leds: ["caps"] }, ignoreInputSuppression: true }]);
  });

  it("accepts short LED aliases for preview overrides", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show", "demo", "--leds", "c,n"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "runDemo", overrides: { leds: ["caps", "num"] }, ignoreInputSuppression: true }]);
  });

  it("previews one state with show", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show", "blocked"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setState", state: "blocked", ttlMs: 5_000, overrides: undefined, ignoreInputSuppression: true },
    ]);
  });

  it("previews one state with a runtime LED override", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show", "working", "--leds", "caps,num"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setState", state: "working", ttlMs: 5_000, overrides: { leds: ["caps", "num"] }, ignoreInputSuppression: true },
    ]);
  });

  it("previews one state kind with show -k", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show", "working", "-k", "command"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setState", state: "working", kind: "command", ttlMs: 5_000, overrides: undefined, ignoreInputSuppression: true },
    ]);
  });

  it("previews one state kind with show state.kind", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["show", "error.critical"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setState", state: "error", kind: "critical", ttlMs: 5_000, overrides: undefined, ignoreInputSuppression: true },
    ]);
  });

  it("sends a direct LED test request", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["led", "test", "num"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      {
        type: "pokeLed",
        led: "num",
      },
    ]);
  });

  it("stops the daemon explicitly", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["daemon", "stop"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "shutdown" }]);
  });

  it("restarts the daemon explicitly", async () => {
    let statusAttempts = 0;
    const requests: unknown[] = [];
    const spawnCalls: string[] = [];

    const exitCode = await runCli(["daemon", "restart"], {
      platform: "win32",
      createClient: () => ({
        async request(request: unknown) {
          requests.push(request);

          if ((request as { type?: string }).type === "shutdown") {
            return { ok: true };
          }

          statusAttempts += 1;
          if (statusAttempts < 3) {
            const error = new Error("connect ECONNREFUSED");
            (error as { code?: string }).code = "ECONNREFUSED";
            throw error;
          }

          return {
            ok: true,
            data: {
              daemon: "running",
            },
          };
        },
      }),
      spawnDaemon: async () => {
        spawnCalls.push("spawned");
      },
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(spawnCalls).toEqual(["spawned"]);
    expect(requests[0]).toMatchObject({ type: "shutdown" });
    expect(requests.filter((request) => (request as { type?: string }).type === "getStatus").length).toBeGreaterThan(0);
  });

  it("sends blocked requests", async () => {
    const blockedClient = createClientFactory([{ ok: true }]);
    const blockedExit = await runCli(["set", "blocked"], {
      platform: "win32",
      createClient: blockedClient.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(blockedExit).toBe(0);
    expect(blockedClient.requests[0]).toMatchObject({
      type: "setState",
      state: "blocked",
    });
  });

  it("accepts comma or whitespace separated LED config values", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["config", "set", "leds", "caps num scroll"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setConfig", patch: { leds: ["caps", "num", "scroll"] } },
    ]);
  });

  it("normalizes short LED aliases in config values and direct LED commands", async () => {
    const configClient = createClientFactory([{ ok: true }]);
    const configExit = await runCli(["config", "set", "leds", "c n s"], {
      platform: "win32",
      createClient: configClient.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    const pokeClient = createClientFactory([{ ok: true }]);
    const pokeExit = await runCli(["led", "test", "c"], {
      platform: "win32",
      createClient: pokeClient.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(configExit).toBe(0);
    expect(configClient.requests).toEqual([
      { type: "setConfig", patch: { leds: ["caps", "num", "scroll"] } },
    ]);
    expect(pokeExit).toBe(0);
    expect(pokeClient.requests).toEqual([{ type: "pokeLed", led: "caps" }]);
  });

  it("sends config reset as a resetConfig request", async () => {
    const stdout: string[] = [];
    const clientFactory = createClientFactory([
      {
        ok: true,
        data: {
          deleted: true,
          path: "C:\\Users\\Apollo\\AppData\\Roaming\\AgentLumos\\config.json",
        },
      },
    ]);
    const exitCode = await runCli(["config", "reset"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "resetConfig" }]);
    expect(stdout.join("")).toContain('"deleted": true');
    expect(stdout.join("")).toContain('"path"');
  });

  it("does not expose the old config clean command", async () => {
    const stderr: string[] = [];
    const exitCode = await runCli(["config", "clean"], {
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async (chunk: string) => { stderr.push(chunk); } },
    });

    expect(exitCode).toBe(2);
    expect(stderr.join("")).toContain("unknown command");
  });

  it("prints hook integration config", async () => {
    const stdout: string[] = [];
    const clientFactory = createClientFactory([
      {
        ok: true,
        data: {
          hookIntegrations: {
            codex: {
              enabled: false,
              hooks: {
                Stop: "success",
              },
            },
            "claude-code": {
              enabled: false,
              hooks: {
                SessionEnd: "idle",
              },
            },
          },
        },
      },
    ]);
    const exitCode = await runCli(["hook", "get"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "getConfig" }]);
    expect(stdout.join("")).toContain('"codex"');
  });

  it("installs native hook snippets", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-hooks-"));
    const hooksPath = path.join(dir, "hooks.json");
    const originalPath = process.env.AGENTLUMOS_CODEX_HOOKS_PATH;
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = hooksPath;
    const stdout: string[] = [];
    const clientFactory = createClientFactory([
      {
        ok: true,
        data: {
          hookIntegrations: {
            codex: {
              enabled: false,
              hooks: {
                SessionStart: { state: "working", kind: "preparing" },
                PermissionRequest: { state: "blocked", kind: "permission" },
              },
            },
            "claude-code": {
              enabled: false,
              hooks: {},
            },
          },
        },
      },
    ]);
    const exitCode = await runCli(["hook", "install", "codex"], {
        platform: "win32",
        createClient: clientFactory.createClient,
        spawnDaemon: async () => {},
        stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
        stderr: { write: async () => true },
      });
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = originalPath;

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "getConfig" }]);
    expect(stdout.join("")).toContain('"installed": 2');
    expect(stdout.join("")).toContain('"codex"');
    expect(fs.readFileSync(hooksPath, "utf8")).toContain("AgentLumos: working.preparing");
    expect(fs.readFileSync(hooksPath, "utf8")).toContain("AgentLumos: blocked.permission");
  });

  it("uninstalls only AgentLumos hook handlers", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-hooks-"));
    const hooksPath = path.join(dir, "hooks.json");
    const originalPath = process.env.AGENTLUMOS_CODEX_HOOKS_PATH;
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = hooksPath;
    fs.writeFileSync(
      hooksPath,
      `\uFEFF${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  { type: "command", command: "lumos set success", statusMessage: "AgentLumos: success" },
                  { type: "command", command: "echo keep", statusMessage: "Keep me" },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}`,
      "utf8",
    );

    const stdout: string[] = [];
    const exitCode = await runCli(["hook", "uninstall", "codex"], {
      platform: "win32",
      createClient: () => {
        throw new Error("should not connect");
      },
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = originalPath;

    const updated = fs.readFileSync(hooksPath, "utf8");
    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain('"removed": 1');
    expect(updated).not.toContain("AgentLumos:");
    expect(updated).toContain("echo keep");
  });

  it("prints hook check output", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-hooks-"));
    const hooksPath = path.join(dir, "hooks.json");
    const originalPath = process.env.AGENTLUMOS_CODEX_HOOKS_PATH;
    const originalPathEnv = process.env.PATH;
    const originalPathExt = process.env.PATHEXT;
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = hooksPath;
    process.env.PATHEXT = ".CMD;.EXE";
    process.env.PATH = `${dir}${path.delimiter}${originalPathEnv ?? ""}`;
    for (const command of ["lumos", "codex", "claude"]) {
      fs.writeFileSync(path.join(dir, `${command}.cmd`), "", "utf8");
    }
    const config = getDefaultConfig();
    const codexHooks = Object.fromEntries(
      Object.entries(config.hookIntegrations.codex.hooks).map(([eventName, signal]) => {
        const formatted = signal.kind ? `${signal.state}.${signal.kind}` : signal.state;
        const command = signal.state === "idle" ? "lumos off" : `lumos set ${signal.state}${signal.kind ? ` -k ${signal.kind}` : ""}`;
        return [
          eventName,
          [{ hooks: [{ type: "command", command, statusMessage: `AgentLumos: ${formatted}` }] }],
        ];
      }),
    );
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: codexHooks,
      }),
      "utf8",
    );
    const stdout: string[] = [];
    const clientFactory = createClientFactory([
      { ok: true, data: { daemon: "running" } },
      { ok: true, data: config },
    ]);
    const exitCode = await runCli(["hook", "check"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = originalPath;
    process.env.PATH = originalPathEnv;
    process.env.PATHEXT = originalPathExt;

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([{ type: "getStatus" }, { type: "getConfig" }]);
    expect(stdout.join("")).toContain("AgentLumos Hook Check");
    expect(stdout.join("")).toContain("Codex");
    expect(stdout.join("")).toContain("Hooks: installed");
    expect(stdout.join("")).toContain("Handlers: 6");
    expect(stdout.join("")).toContain("Result: not ready");
  });

  it("prints hook check as json when requested", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-hooks-"));
    const originalPath = process.env.AGENTLUMOS_CODEX_HOOKS_PATH;
    const originalPathEnv = process.env.PATH;
    const originalPathExt = process.env.PATHEXT;
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = path.join(dir, "missing-hooks.json");
    process.env.PATHEXT = ".CMD;.EXE";
    process.env.PATH = `${dir}${path.delimiter}${originalPathEnv ?? ""}`;
    for (const command of ["lumos", "codex", "claude"]) {
      fs.writeFileSync(path.join(dir, `${command}.cmd`), "", "utf8");
    }
    const stdout: string[] = [];
    const clientFactory = createClientFactory([
      { ok: true, data: { daemon: "running" } },
      { ok: true, data: getDefaultConfig() },
    ]);

    const exitCode = await runCli(["hook", "check", "--json"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async (chunk: string) => { stdout.push(chunk); } },
      stderr: { write: async () => true },
    });
    process.env.AGENTLUMOS_CODEX_HOOKS_PATH = originalPath;
    process.env.PATH = originalPathEnv;
    process.env.PATHEXT = originalPathExt;

    const output = JSON.parse(stdout.join(""));
    expect(exitCode).toBe(0);
    expect(output.agentLumosHooksReady).toBe(false);
    expect(output.targets.codex.toolInstalled).toBe(true);
    expect(output.targets.codex.hookInstalled).toBe(false);
    expect(output.targets.codex.missingEvents).toContain("SessionStart");
    expect(output.sections).toBeUndefined();
    expect(output.targets.codex.enabled).toBeUndefined();
  });

  it("spawns the daemon and retries after an ipc failure", async () => {
    let firstAttempt = true;
    const requests: unknown[] = [];
    const spawnCalls: string[] = [];

    const exitCode = await runCli(["status"], {
      platform: "win32",
      createClient: () => ({
        async request(request: unknown) {
          requests.push(request);
          if (firstAttempt) {
            firstAttempt = false;
            const error = new Error("connect ECONNREFUSED");
            (error as { code?: string }).code = "ECONNREFUSED";
            throw error;
          }

          return {
            ok: true,
            data: {
              daemon: "running",
            },
          };
        },
      }),
      spawnDaemon: async () => {
        spawnCalls.push("spawned");
      },
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(spawnCalls).toEqual(["spawned"]);
    expect(requests).toEqual([{ type: "getStatus" }, { type: "getStatus" }]);
  });
});
