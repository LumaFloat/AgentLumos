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
  });

  it.each([
    [["set", "active", "--wat"], "unknown option"],
    [["set", "active", "--ttl"], "argument missing"],
    [["set", "active", "--ttl", "5s", "--ttl", "6s"], "Duplicate option: --ttl"],
    [["show", "idle"], "Invalid state: idle"],
    [["off", "extra"], "too many arguments"],
    [["status", "--json"], "unknown option"],
    [["poke", "caps", "num"], "too many arguments"],
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

    const exitCode = await runCli(["set", "active"], {
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

  it("sends set active as a setState request", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["set", "active"], {
      platform: "win32",
      createClient: clientFactory.createClient,
      spawnDaemon: async () => {},
      stdout: { write: async () => true },
      stderr: { write: async () => true },
    });

    expect(exitCode).toBe(0);
    expect(clientFactory.requests).toEqual([
      { type: "setState", state: "active", ttlMs: undefined, overrides: undefined },
    ]);
  });

  it("sends runtime overrides ahead of config", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli([
      "set",
      "active",
      "--ttl",
      "5s",
      "--leds",
      "caps,num",
      "--animation",
      "scan-pingpong",
    ], {
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
        state: "active",
        ttlMs: 5_000,
        overrides: {
          leds: ["caps", "num"],
          animation: "scan-pingpong",
        },
      },
    ]);
  });

  it("treats ttl zero as an infinite request", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["set", "active", "--ttl", "0"], {
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
        state: "active",
        ttlMs: 0,
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
    expect(clientFactory.requests).toEqual([{ type: "runDemo" }]);
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
      { type: "setState", state: "blocked", ttlMs: 2_000 },
    ]);
  });

  it("sends a direct LED poke request", async () => {
    const clientFactory = createClientFactory([{ ok: true }]);
    const exitCode = await runCli(["poke", "num"], {
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

  it("sends config clean as a resetConfig request", async () => {
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
    const exitCode = await runCli(["config", "clean"], {
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
                SessionStart: "active",
                PermissionRequest: "blocked",
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
    expect(fs.readFileSync(hooksPath, "utf8")).toContain("AgentLumos: active");
    expect(fs.readFileSync(hooksPath, "utf8")).toContain("AgentLumos: blocked");
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
      Object.entries(config.hookIntegrations.codex.hooks).map(([eventName, state]) => [
        eventName,
        [{ hooks: [{ type: "command", command: state === "idle" ? "lumos off" : `lumos set ${state}`, statusMessage: `AgentLumos: ${state}` }] }],
      ]),
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
