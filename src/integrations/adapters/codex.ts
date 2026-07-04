import os from "node:os";
import path from "node:path";
import type { AgentAdapter } from "../types";

export const CODEX_HOOKS_PATH_ENV = "AGENTLUMOS_CODEX_HOOKS_PATH";

export function getCodexHooksPath(): string {
  const override = process.env[CODEX_HOOKS_PATH_ENV];
  if (override) {
    return override;
  }

  return path.join(os.homedir(), ".codex", "hooks.json");
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  displayName: "Codex",
  supportLevel: "stable",
  commandNames: ["codex"],
  installStrategy: {
    type: "json-hooks",
    configPath: getCodexHooksPath,
    configPathEnv: CODEX_HOOKS_PATH_ENV,
    documentHooksKey: "hooks",
  },
  events: {
    SessionStart: { state: "working", kind: "preparing" },
    UserPromptSubmit: { state: "working", kind: "preparing" },
    PreToolUse: { state: "working", kind: "tool" },
    PostToolUse: { state: "working" },
    PermissionRequest: { state: "blocked", kind: "permission" },
    Stop: { state: "success", kind: "turn" },
  },
};
