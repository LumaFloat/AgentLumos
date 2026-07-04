import fs from "node:fs";
import path from "node:path";
import { formatStateSignal } from "../state";
import { inspectJsonHooks } from "./json-hooks";
import type { AgentAdapter, HookCheckReport, HookTargetCheck } from "./types";

export interface HookCheckOptions {
  daemonReady: boolean;
  adapters: AgentAdapter[];
  env?: NodeJS.ProcessEnv;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function commandExists(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const pathValue = env.PATH ?? "";
  const pathExt = process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM") : "";
  const extensions = process.platform === "win32" ? pathExt.split(";").filter(Boolean) : [""];

  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = path.join(directory, process.platform === "win32" ? `${command}${extension.toLowerCase()}` : command);
      const candidateUpper = path.join(directory, process.platform === "win32" ? `${command}${extension.toUpperCase()}` : command);
      if (fs.existsSync(candidate) || fs.existsSync(candidateUpper)) {
        return true;
      }
    }
  }

  return false;
}

function canWriteExistingPath(filePath: string): boolean | null {
  const target = fs.existsSync(filePath) ? filePath : path.dirname(filePath);
  if (!fs.existsSync(target)) {
    return null;
  }

  try {
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function expectedEventsFor(adapter: AgentAdapter): Record<string, string> {
  return Object.fromEntries(
    Object.entries(adapter.events).map(([eventName, signal]) => [eventName, formatStateSignal(signal)]),
  );
}

function getAdapterCommand(adapter: AgentAdapter, env: NodeJS.ProcessEnv): { installed: boolean; commandName: string | null } {
  for (const commandName of adapter.commandNames) {
    if (commandExists(commandName, env)) {
      return { installed: true, commandName };
    }
  }

  return { installed: false, commandName: adapter.commandNames[0] ?? null };
}

function getTargetCheck(adapter: AgentAdapter, env: NodeJS.ProcessEnv): HookTargetCheck {
  const command = getAdapterCommand(adapter, env);
  const expectedEvents = expectedEventsFor(adapter);

  if (!command.installed) {
    return {
      adapter: adapter.id,
      displayName: adapter.displayName,
      supportLevel: adapter.supportLevel,
      toolInstalled: false,
      commandName: command.commandName,
      hookInstalled: false,
      hookCheckSkipped: true,
      skipReason: `${command.commandName ?? adapter.id} command not found`,
      expectedEvents,
      installedEvents: {},
      missingEvents: [],
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
    };
  }

  if (adapter.installStrategy.type !== "json-hooks") {
    return {
      adapter: adapter.id,
      displayName: adapter.displayName,
      supportLevel: adapter.supportLevel,
      toolInstalled: true,
      commandName: command.commandName,
      hookInstalled: false,
      hookCheckSkipped: true,
      skipReason: `${adapter.displayName} does not support automatic hook checks`,
      expectedEvents,
      installedEvents: {},
      missingEvents: [],
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
    };
  }

  const filePath = adapter.installStrategy.configPath();
  const exists = fs.existsSync(filePath);
  const writable = canWriteExistingPath(filePath);

  if (!exists) {
    return {
      adapter: adapter.id,
      displayName: adapter.displayName,
      supportLevel: adapter.supportLevel,
      toolInstalled: true,
      commandName: command.commandName,
      path: filePath,
      pathExists: exists,
      pathWritable: writable,
      hookInstalled: false,
      hookCheckSkipped: false,
      expectedEvents,
      installedEvents: {},
      missingEvents: Object.keys(expectedEvents),
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
    };
  }

  try {
    const { managedHandlers, installedEvents } = inspectJsonHooks(adapter);
    const missingEvents = Object.entries(expectedEvents)
      .filter(([event, signal]) => !(installedEvents[event] ?? []).includes(signal))
      .map(([event]) => event);
    const extraEvents = Object.keys(installedEvents).filter((event) => !(event in expectedEvents));
    const mismatchedEvents = Object.entries(expectedEvents)
      .filter(([event, signal]) => installedEvents[event] && !installedEvents[event].includes(signal))
      .map(([event, signal]) => ({ event, expected: signal, actual: installedEvents[event] }));

    return {
      adapter: adapter.id,
      displayName: adapter.displayName,
      supportLevel: adapter.supportLevel,
      toolInstalled: true,
      commandName: command.commandName,
      path: filePath,
      pathExists: exists,
      pathWritable: writable,
      hookInstalled: missingEvents.length === 0 && extraEvents.length === 0 && mismatchedEvents.length === 0,
      hookCheckSkipped: false,
      expectedEvents,
      installedEvents,
      missingEvents,
      extraEvents,
      mismatchedEvents,
      managedHandlers,
    };
  } catch (error) {
    return {
      adapter: adapter.id,
      displayName: adapter.displayName,
      supportLevel: adapter.supportLevel,
      toolInstalled: true,
      commandName: command.commandName,
      path: filePath,
      pathExists: exists,
      pathWritable: writable,
      hookInstalled: false,
      hookCheckSkipped: false,
      expectedEvents,
      installedEvents: {},
      missingEvents: Object.keys(expectedEvents),
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
      error: toErrorMessage(error),
    };
  }
}

export function getHookCheckReport(options: HookCheckOptions): HookCheckReport {
  const env = options.env ?? process.env;
  const agentLumos = {
    daemonReady: options.daemonReady,
    commandInstalled: commandExists("lumos", env),
  };
  const targets = Object.fromEntries(options.adapters.map((adapter) => [adapter.id, getTargetCheck(adapter, env)]));
  const issues: string[] = [];
  const nextSteps: string[] = [];

  if (!agentLumos.commandInstalled) {
    issues.push("lumos command not found in PATH.");
  }
  if (!agentLumos.daemonReady) {
    issues.push("AgentLumos daemon is not available.");
    nextSteps.push("Run lumos daemon restart.");
  }

  for (const targetCheck of Object.values(targets)) {
    if (!targetCheck.toolInstalled) {
      issues.push(`${targetCheck.adapter} tool is not available.`);
      if (targetCheck.commandName) {
        nextSteps.push(`Install ${targetCheck.commandName} before installing AgentLumos hooks.`);
      }
      continue;
    }
    if (targetCheck.hookCheckSkipped) {
      continue;
    }
    if (targetCheck.error) {
      issues.push(`${targetCheck.adapter} hook config is not valid JSON: ${targetCheck.error}`);
      continue;
    }
    if (targetCheck.pathWritable === false) {
      issues.push(`${targetCheck.adapter} hook config path is not writable.`);
    }
    if (!targetCheck.hookInstalled) {
      if (targetCheck.missingEvents.length > 0) {
        issues.push(`${targetCheck.adapter} is missing AgentLumos hooks: ${targetCheck.missingEvents.join(", ")}.`);
      }
      if (targetCheck.extraEvents.length > 0) {
        issues.push(`${targetCheck.adapter} has extra AgentLumos hooks: ${targetCheck.extraEvents.join(", ")}.`);
      }
      nextSteps.push(`Run lumos hook install ${targetCheck.adapter}.`);
    }
  }

  return {
    agentLumosHooksReady: issues.length === 0,
    agentLumos,
    targets,
    issues,
    nextSteps,
  };
}
