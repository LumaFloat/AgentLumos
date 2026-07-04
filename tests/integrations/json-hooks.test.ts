import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/integrations/adapters/codex";
import {
  buildAgentLumosHookHandler,
  inspectJsonHooks,
  installJsonHooks,
  lumosCommandForState,
  uninstallJsonHooks,
} from "../../src/integrations/json-hooks";
import type { AgentAdapter } from "../../src/integrations/types";

function adapterWithPath(filePath: string, events = codexAdapter.events): AgentAdapter {
  return {
    ...codexAdapter,
    installStrategy: {
      type: "json-hooks",
      configPath: () => filePath,
      documentHooksKey: "hooks",
    },
    events,
  };
}

describe("json hook strategy", () => {
  it("renders lumos commands for state signals", () => {
    expect(lumosCommandForState({ state: "working", kind: "tool" })).toBe("lumos set working -k tool");
    expect(lumosCommandForState({ state: "working" })).toBe("lumos set working");
    expect(lumosCommandForState({ state: "idle" })).toBe("lumos off");
  });

  it("builds native AgentLumos handlers", () => {
    expect(buildAgentLumosHookHandler({ state: "working", kind: "tool" })).toEqual({
      type: "command",
      command: "lumos set working -k tool",
      commandWindows: "lumos set working -k tool",
      timeout: 10,
      statusMessage: "AgentLumos: working.tool",
    });
  });

  it("installs handlers while preserving non-AgentLumos hooks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-json-hooks-"));
    const hooksPath = path.join(dir, "hooks.json");
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo keep", statusMessage: "Keep me" }] }],
        },
      }),
      "utf8",
    );

    const result = installJsonHooks(adapterWithPath(hooksPath, {
      Stop: { state: "success", kind: "turn" },
      SessionEnd: { state: "idle" },
    }));

    const updated = fs.readFileSync(hooksPath, "utf8");
    expect(result).toEqual({ adapter: "codex", installed: 2, path: hooksPath });
    expect(updated).toContain("echo keep");
    expect(updated).toContain("AgentLumos: success.turn");
    expect(updated).toContain("AgentLumos: idle");
  });

  it("uninstalls only AgentLumos-managed handlers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-json-hooks-"));
    const hooksPath = path.join(dir, "hooks.json");
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
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
      }),
      "utf8",
    );

    const result = uninstallJsonHooks(adapterWithPath(hooksPath));

    const updated = fs.readFileSync(hooksPath, "utf8");
    expect(result).toEqual({ adapter: "codex", removed: 1, path: hooksPath });
    expect(updated).not.toContain("AgentLumos:");
    expect(updated).toContain("echo keep");
  });

  it("inspects installed managed hook events", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-json-hooks-"));
    const hooksPath = path.join(dir, "hooks.json");
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "lumos set success", statusMessage: "AgentLumos: success.turn" }] }],
          Extra: [{ hooks: [{ type: "command", command: "lumos set error", statusMessage: "AgentLumos: error.critical" }] }],
        },
      }),
      "utf8",
    );

    expect(inspectJsonHooks(adapterWithPath(hooksPath))).toEqual({
      managedHandlers: 2,
      installedEvents: {
        Stop: ["success.turn"],
        Extra: ["error.critical"],
      },
    });
  });
});
