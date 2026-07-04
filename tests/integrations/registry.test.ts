import { describe, expect, it } from "vitest";
import { getAdapter, listAdapters, listStableAdapters } from "../../src/integrations/registry";

describe("integration registry", () => {
  it("registers only Codex and Claude Code in v0.6", () => {
    expect(listAdapters().map((adapter) => adapter.id)).toEqual(["codex", "claude-code"]);
  });

  it("exposes Codex adapter metadata and mappings", () => {
    expect(getAdapter("codex")).toMatchObject({
      id: "codex",
      displayName: "Codex",
      supportLevel: "stable",
      commandNames: ["codex"],
      events: {
        SessionStart: { state: "working", kind: "preparing" },
        UserPromptSubmit: { state: "working", kind: "preparing" },
        PreToolUse: { state: "working", kind: "tool" },
        PostToolUse: { state: "working" },
        PermissionRequest: { state: "blocked", kind: "permission" },
        Stop: { state: "success", kind: "turn" },
      },
    });
  });

  it("exposes Claude Code adapter metadata and mappings", () => {
    expect(getAdapter("claude-code")).toMatchObject({
      id: "claude-code",
      displayName: "Claude Code",
      supportLevel: "stable",
      commandNames: ["claude"],
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
    });
  });

  it("returns stable adapters for default hook checks", () => {
    expect(listStableAdapters().map((adapter) => adapter.id)).toEqual(["codex", "claude-code"]);
  });

  it("returns null for unknown adapters", () => {
    expect(getAdapter("gemini")).toBeNull();
  });
});
