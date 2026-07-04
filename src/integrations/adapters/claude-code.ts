import os from "node:os";
import path from "node:path";
import type { AgentAdapter } from "../types";

export const CLAUDE_CODE_SETTINGS_PATH_ENV = "AGENTLUMOS_CLAUDE_CODE_SETTINGS_PATH";

export function getClaudeCodeSettingsPath(): string {
  const override = process.env[CLAUDE_CODE_SETTINGS_PATH_ENV];
  if (override) {
    return override;
  }

  return path.join(os.homedir(), ".claude", "settings.json");
}

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  supportLevel: "stable",
  commandNames: ["claude"],
  installStrategy: {
    type: "json-hooks",
    configPath: getClaudeCodeSettingsPath,
    configPathEnv: CLAUDE_CODE_SETTINGS_PATH_ENV,
    documentHooksKey: "hooks",
  },
  events: {
    SessionStart: { state: "working", kind: "preparing" },
    UserPromptSubmit: { state: "working", kind: "preparing" },
    PreToolUse: { state: "working", kind: "tool" },
    PostToolUseFailure: { state: "error", kind: "tool" },
    PermissionRequest: { state: "blocked", kind: "permission" },
    Notification: { state: "blocked", kind: "input" },
    Stop: { state: "success", kind: "turn" },
    StopFailure: { state: "error", kind: "critical" },
    SessionEnd: { state: "idle" },
  },
};
