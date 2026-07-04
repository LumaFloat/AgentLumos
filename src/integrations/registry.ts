import { claudeCodeAdapter } from "./adapters/claude-code";
import { codexAdapter } from "./adapters/codex";
import type { AgentAdapter } from "./types";

const ADAPTERS: AgentAdapter[] = [codexAdapter, claudeCodeAdapter];

export function listAdapters(): AgentAdapter[] {
  return [...ADAPTERS];
}

export function listStableAdapters(): AgentAdapter[] {
  return ADAPTERS.filter((adapter) => adapter.supportLevel === "stable");
}

export function getAdapter(id: string): AgentAdapter | null {
  return ADAPTERS.find((adapter) => adapter.id === id) ?? null;
}
