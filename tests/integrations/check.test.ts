import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/integrations/adapters/codex";
import { getHookCheckReport } from "../../src/integrations/check";
import { installJsonHooks } from "../../src/integrations/json-hooks";
import type { AgentAdapter } from "../../src/integrations/types";

function adapterWithPath(filePath: string): AgentAdapter {
  return {
    ...codexAdapter,
    installStrategy: {
      type: "json-hooks",
      configPath: () => filePath,
      documentHooksKey: "hooks",
    },
  };
}

function writeCommand(dir: string, command: string): void {
  fs.writeFileSync(path.join(dir, `${command}.cmd`), "", "utf8");
}

describe("integration hook checks", () => {
  it("reports installed hooks as ready for one adapter", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-check-"));
    const hooksPath = path.join(dir, "hooks.json");
    const adapter = adapterWithPath(hooksPath);
    writeCommand(dir, "lumos");
    writeCommand(dir, "codex");
    installJsonHooks(adapter);

    const report = getHookCheckReport({
      daemonReady: true,
      adapters: [adapter],
      env: {
        PATH: dir,
        PATHEXT: ".CMD;.EXE",
      },
    });

    expect(report.agentLumosHooksReady).toBe(true);
    expect(report.targets.codex.hookInstalled).toBe(true);
    expect(report.targets.codex.missingEvents).toEqual([]);
    expect(report.targets.codex.extraEvents).toEqual([]);
  });

  it("reports missing, extra, and mismatched managed events", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-check-"));
    const hooksPath = path.join(dir, "hooks.json");
    const adapter = adapterWithPath(hooksPath);
    writeCommand(dir, "lumos");
    writeCommand(dir, "codex");
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "lumos set error", statusMessage: "AgentLumos: error.critical" }] }],
          Extra: [{ hooks: [{ type: "command", command: "lumos set success", statusMessage: "AgentLumos: success.turn" }] }],
        },
      }),
      "utf8",
    );

    const report = getHookCheckReport({
      daemonReady: true,
      adapters: [adapter],
      env: {
        PATH: dir,
        PATHEXT: ".CMD;.EXE",
      },
    });

    expect(report.agentLumosHooksReady).toBe(false);
    expect(report.targets.codex.missingEvents).toContain("SessionStart");
    expect(report.targets.codex.extraEvents).toContain("Extra");
    expect(report.targets.codex.mismatchedEvents).toContainEqual({
      event: "Stop",
      expected: "success.turn",
      actual: ["error.critical"],
    });
  });

  it("skips hook document checks when the agent command is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlumos-check-"));
    const adapter = adapterWithPath(path.join(dir, "hooks.json"));
    writeCommand(dir, "lumos");

    const report = getHookCheckReport({
      daemonReady: true,
      adapters: [adapter],
      env: {
        PATH: dir,
        PATHEXT: ".CMD;.EXE",
      },
    });

    expect(report.agentLumosHooksReady).toBe(false);
    expect(report.targets.codex.toolInstalled).toBe(false);
    expect(report.targets.codex.hookCheckSkipped).toBe(true);
    expect(report.targets.codex.skipReason).toContain("codex command not found");
  });
});
