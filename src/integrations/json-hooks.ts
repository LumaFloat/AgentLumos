import fs from "node:fs";
import path from "node:path";
import { formatStateSignal, parseStateSignal } from "../state";
import type { LumosStateSignal } from "../types";
import type {
  AgentAdapter,
  HookInstallResult,
  HookUninstallResult,
  InstalledHookEvents,
  NativeHookConfig,
  NativeHookDocument,
  NativeHookGroup,
  NativeHookHandler,
} from "./types";

function getJsonHooksPath(adapter: AgentAdapter): string {
  if (adapter.installStrategy.type !== "json-hooks") {
    throw new Error(`${adapter.displayName} does not support automatic JSON hook installation.`);
  }

  return adapter.installStrategy.configPath();
}

export function lumosCommandForState(signal: LumosStateSignal): string {
  if (signal.state === "idle") {
    return "lumos off";
  }

  return signal.kind ? `lumos set ${signal.state} -k ${signal.kind}` : `lumos set ${signal.state}`;
}

export function buildAgentLumosHookHandler(signal: LumosStateSignal): NativeHookHandler {
  const formatted = formatStateSignal(signal);
  return {
    type: "command",
    command: lumosCommandForState(signal),
    commandWindows: lumosCommandForState(signal),
    timeout: 10,
    statusMessage: `AgentLumos: ${formatted}`,
  };
}

export function readJsonDocument(filePath: string): NativeHookDocument {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const contents = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(contents) as NativeHookDocument;
}

export function writeJsonDocument(filePath: string, document: NativeHookDocument): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function isAgentLumosHookHandler(handler: NativeHookHandler): boolean {
  return typeof handler.statusMessage === "string" && handler.statusMessage.startsWith("AgentLumos:");
}

function removeAgentLumosHooks(document: NativeHookDocument): { document: NativeHookDocument; removed: number } {
  let removed = 0;
  const existingHooks = document.hooks ?? {};
  const nextHooks: NativeHookConfig = {};

  for (const [eventName, groups] of Object.entries(existingHooks)) {
    const nextGroups: NativeHookGroup[] = [];
    for (const group of groups) {
      const handlers = Array.isArray(group.hooks) ? group.hooks : [];
      const filteredHandlers = handlers.filter((handler) => {
        const shouldRemove = isAgentLumosHookHandler(handler);
        if (shouldRemove) {
          removed += 1;
        }
        return !shouldRemove;
      });

      if (filteredHandlers.length > 0) {
        nextGroups.push({
          ...group,
          hooks: filteredHandlers,
        });
      }
    }

    if (nextGroups.length > 0) {
      nextHooks[eventName] = nextGroups;
    }
  }

  return {
    document: {
      ...document,
      hooks: nextHooks,
    },
    removed,
  };
}

export function installJsonHooks(adapter: AgentAdapter): HookInstallResult {
  const filePath = getJsonHooksPath(adapter);
  const current = readJsonDocument(filePath);
  const cleaned = removeAgentLumosHooks(current).document;
  const hooks: NativeHookConfig = { ...(cleaned.hooks ?? {}) };
  let installed = 0;

  for (const [eventName, signal] of Object.entries(adapter.events)) {
    const group = { hooks: [buildAgentLumosHookHandler(signal)] };
    hooks[eventName] = [...(hooks[eventName] ?? []), group];
    installed += 1;
  }

  writeJsonDocument(filePath, {
    ...cleaned,
    hooks,
  });

  return {
    adapter: adapter.id,
    installed,
    path: filePath,
  };
}

export function uninstallJsonHooks(adapter: AgentAdapter): HookUninstallResult {
  const filePath = getJsonHooksPath(adapter);
  const current = readJsonDocument(filePath);
  const { document, removed } = removeAgentLumosHooks(current);
  writeJsonDocument(filePath, document);

  return {
    adapter: adapter.id,
    removed,
    path: filePath,
  };
}

function getAgentLumosHookSignal(handler: NativeHookHandler): string | null {
  if (!isAgentLumosHookHandler(handler)) {
    return null;
  }

  const rawSignal = (handler.statusMessage as string).slice("AgentLumos:".length).trim();
  try {
    return formatStateSignal(parseStateSignal(rawSignal, "AgentLumos hook status"));
  } catch {
    return null;
  }
}

export function inspectJsonHooks(adapter: AgentAdapter): InstalledHookEvents {
  const filePath = getJsonHooksPath(adapter);
  const document = readJsonDocument(filePath);
  let count = 0;
  const installedEvents: Record<string, string[]> = {};

  for (const [eventName, groups] of Object.entries(document.hooks ?? {})) {
    for (const group of groups) {
      const handlers = Array.isArray(group.hooks) ? group.hooks : [];
      for (const handler of handlers) {
        const signal = getAgentLumosHookSignal(handler);
        if (signal) {
          count += 1;
          installedEvents[eventName] = [...(installedEvents[eventName] ?? []), signal];
        }
      }
    }
  }

  return { managedHandlers: count, installedEvents };
}
