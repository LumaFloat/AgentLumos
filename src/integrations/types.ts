import type { LumosStateSignal } from "../types";

export type AdapterSupportLevel = "stable" | "experimental" | "planned" | "unsupported";

export type JsonHooksInstallStrategy = {
  type: "json-hooks";
  configPath: () => string;
  configPathEnv?: string;
  documentHooksKey: "hooks";
};

export type AdapterInstallStrategy =
  | JsonHooksInstallStrategy
  | { type: "manual"; instructions: string[] }
  | { type: "unsupported"; reason: string };

export interface AgentAdapter {
  id: string;
  displayName: string;
  supportLevel: AdapterSupportLevel;
  commandNames: string[];
  installStrategy: AdapterInstallStrategy;
  events: Record<string, LumosStateSignal>;
  notes?: string[];
}

export type NativeHookHandler = Record<string, unknown>;
export type NativeHookGroup = { matcher?: string; hooks?: NativeHookHandler[] } & Record<string, unknown>;
export type NativeHookConfig = Record<string, NativeHookGroup[]>;
export type NativeHookDocument = { hooks?: NativeHookConfig } & Record<string, unknown>;

export interface HookInstallResult {
  adapter: string;
  installed: number;
  path: string;
}

export interface HookUninstallResult {
  adapter: string;
  removed: number;
  path: string;
}

export interface InstalledHookEvents {
  managedHandlers: number;
  installedEvents: Record<string, string[]>;
}

export interface HookTargetCheck {
  adapter: string;
  displayName: string;
  supportLevel: AdapterSupportLevel;
  toolInstalled: boolean;
  commandName: string | null;
  path?: string;
  pathExists?: boolean;
  pathWritable?: boolean | null;
  hookInstalled: boolean;
  hookCheckSkipped: boolean;
  skipReason?: string;
  expectedEvents: Record<string, string>;
  installedEvents: Record<string, string[]>;
  missingEvents: string[];
  extraEvents: string[];
  mismatchedEvents: Array<{ event: string; expected: string; actual: string[] }>;
  managedHandlers: number;
  error?: string;
}

export interface HookCheckReport {
  agentLumosHooksReady: boolean;
  agentLumos: {
    daemonReady: boolean;
    commandInstalled: boolean;
  };
  targets: Record<string, HookTargetCheck>;
  issues: string[];
  nextSteps: string[];
}
