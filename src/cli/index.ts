#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseTtlOrZero } from "../core/duration";
import { createNamedPipeClient } from "../daemon/named-pipe-client";
import { getDaemonPipePath } from "../daemon/pipe-path";
import type {
  AnimationName,
  DaemonRequest,
  DaemonResponse,
  HookIntegrationConfig,
  HookIntegrationName,
  LedName,
  LumosConfig,
  LumosState,
  LumosStateOverride,
} from "../types";
import { formatJson, formatWarning } from "./format";

const DAEMON_START_RETRY_COUNT = 20;
const DAEMON_START_RETRY_DELAY_MS = 100;

export interface DaemonClient {
  request(request: DaemonRequest): Promise<DaemonResponse>;
}

export interface CliDeps {
  createClient(): DaemonClient;
  spawnDaemon(): Promise<void>;
  stdout: { write(chunk: string): boolean | void | Promise<boolean | void> };
  stderr: { write(chunk: string): boolean | void | Promise<boolean | void> };
}

interface ParsedCliCommand {
  request?: DaemonRequest;
  retryOnConnectFailure?: boolean;
  lifecycle?: "daemon-stop" | "daemon-restart";
  local?: "hook-check" | "hook-install" | "hook-uninstall";
  hookTarget?: HookIntegrationName;
  json?: boolean;
  afterResponse?: (response: DaemonResponse) => string | null;
}

interface HookTargetCheck {
  toolInstalled: boolean;
  path?: string;
  pathExists?: boolean;
  pathWritable?: boolean | null;
  hookInstalled: boolean;
  hookCheckSkipped: boolean;
  skipReason?: string;
  expectedEvents: Record<string, LumosState>;
  installedEvents: Record<string, LumosState[]>;
  missingEvents: string[];
  extraEvents: string[];
  mismatchedEvents: Array<{ event: string; expected: LumosState; actual: LumosState[] }>;
  managedHandlers: number;
  error?: string;
}

interface HookCheckReport {
  agentLumosHooksReady: boolean;
  agentLumos: {
    daemonReady: boolean;
    commandInstalled: boolean;
    configLoaded: boolean;
  };
  targets: Record<HookIntegrationName, HookTargetCheck>;
  issues: string[];
  nextSteps: string[];
}

interface HookCheckView {
  title: string;
  sections: HookCheckViewSection[];
  nextSteps: string[];
  result: "ready" | "not ready";
}

interface HookCheckViewSection {
  heading: string;
  rows: Array<{ label: string; value: string }>;
}

function isConnectFailure(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: string }).code === "ECONNREFUSED" ||
        (error as { code?: string }).code === "ENOENT"),
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseConfigValue(key: string, value: string): Partial<{ leds: LedName[]; defaultTtl: string }> {
  if (key === "leds") {
    return {
      leds: parseLedList(value),
    };
  }

  if (key === "defaultTtl") {
    return { defaultTtl: value };
  }

  throw new Error(`Unsupported config key: ${key}`);
}

function parseCommand(argv: string[]): ParsedCliCommand {
  const [command, ...rest] = argv;

  if (!command) {
    throw new Error("No command provided.");
  }

  if (command === "active" || command === "blocked" || command === "success" || command === "error") {
    const parsedArgs = parseStateArguments(rest);
    return {
      request: {
        type: "setState",
        state: command,
        ttlMs: parsedArgs.ttlMs,
        overrides: parsedArgs.overrides,
      },
      retryOnConnectFailure: true,
    };
  }

  if (command === "off") {
    return {
      request: { type: "setState", state: "idle" },
      retryOnConnectFailure: true,
    };
  }

  if (command === "poke" || command === "test") {
    const ledName = rest.find((value) => !value.startsWith("--"));
    if (!ledName) {
      throw new Error("Usage: lumos poke <caps|num|scroll>");
    }

    return {
      request: {
        type: "pokeLed",
        led: parseLedName(ledName),
      },
      retryOnConnectFailure: true,
    };
  }

  if (command === "status") {
    return {
      request: { type: "getStatus" },
      retryOnConnectFailure: true,
      afterResponse: (response) => formatJson((response as Extract<DaemonResponse, { ok: true }>).data),
    };
  }

  if (command === "demo") {
    return {
      request: { type: "runDemo" },
      retryOnConnectFailure: true,
    };
  }

  if (command === "daemon") {
    const [subcommand] = rest;
    if (subcommand === "stop") {
      return {
        request: { type: "shutdown" },
        retryOnConnectFailure: false,
      };
    }

    if (subcommand === "restart") {
      return {
        lifecycle: "daemon-restart",
      };
    }

    throw new Error("Usage: lumos daemon stop | lumos daemon restart");
  }

  if (command === "config") {
    const [subcommand, key, value] = rest;
    if (subcommand === "get") {
      return {
        request: { type: "getConfig" },
        retryOnConnectFailure: true,
        afterResponse: (response) => formatJson((response as Extract<DaemonResponse, { ok: true }>).data),
      };
    }

    if (subcommand === "clean") {
      return {
        request: { type: "resetConfig" },
        retryOnConnectFailure: true,
        afterResponse: (response) => formatJson((response as Extract<DaemonResponse, { ok: true }>).data),
      };
    }

    if (subcommand === "set" && key && value) {
      return {
        request: { type: "setConfig", patch: parseConfigValue(key, value) },
        retryOnConnectFailure: true,
      };
    }

    throw new Error("Usage: lumos config get | lumos config clean | lumos config set <leds|defaultTtl> <value>");
  }

  if (command === "hook") {
    const [subcommand, target] = rest;
    if (subcommand === "get") {
      return {
        request: { type: "getConfig" },
        retryOnConnectFailure: true,
        afterResponse: (response) => formatJson(((response as Extract<DaemonResponse, { ok: true }>).data as LumosConfig).hookIntegrations),
      };
    }

    if (subcommand === "check") {
      const extraArgs = rest.slice(1);
      const json = extraArgs.includes("--json");
      const unknownArgs = extraArgs.filter((arg) => arg !== "--json");
      if (unknownArgs.length > 0) {
        throw new Error("Usage: lumos hook check [--json]");
      }

      return {
        local: "hook-check",
        json,
      };
    }

    if ((subcommand === "install" || subcommand === "uninstall") && target) {
      const hookTarget = parseHookIntegrationName(target);
      return {
        local: subcommand === "install" ? "hook-install" : "hook-uninstall",
        hookTarget,
      };
    }

    throw new Error("Usage: lumos hook get | lumos hook check | lumos hook install <codex|claude-code> | lumos hook uninstall <codex|claude-code>");
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseStateArguments(rest: string[]): { ttlMs?: number; overrides?: LumosStateOverride } {
  const ttl = getFlagValue(rest, "--ttl");
  const leds = getFlagValue(rest, "--leds");
  const animation = getFlagValue(rest, "--animation");
  const overrides: LumosStateOverride = {};

  if (leds) {
    overrides.leds = parseLedList(leds);
  }

  if (animation) {
    overrides.animation = parseAnimationName(animation);
  }

  return {
    ttlMs: ttl ? parseTtlOrZero(ttl) : undefined,
    overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
}

function getFlagValue(rest: string[], flag: string): string | undefined {
  const flagIndex = rest.indexOf(flag);
  if (flagIndex === -1) {
    return undefined;
  }

  const value = rest[flagIndex + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function parseLedList(value: string): LedName[] {
  const leds = value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const led of leds) {
    if (!isLedName(led)) {
      throw new Error(`Invalid LED name: ${led}`);
    }
  }

  return leds as LedName[];
}

function isLedName(value: string): value is LedName {
  return value === "caps" || value === "num" || value === "scroll";
}

function parseLedName(value: string): LedName {
  if (!isLedName(value)) {
    throw new Error(`Invalid LED name: ${value}`);
  }

  return value;
}

function parseAnimationName(value: string): AnimationName {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid animation name: ${value}`);
  }

  return value;
}

function parseHookIntegrationName(value: string): HookIntegrationName {
  if (value === "codex" || value === "claude-code") {
    return value;
  }

  throw new Error(`Invalid hook target: ${value}`);
}

function buildNativeHookSnippet(target: HookIntegrationName, integration: HookIntegrationConfig): { hooks: NativeHookConfig } {
  const hooks = Object.entries(integration.hooks).reduce<Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>>(
    (snippet, [eventName, state]) => {
      snippet[eventName] = [
        {
          hooks: [
            buildAgentLumosHookHandler(state),
          ],
        },
      ];
      return snippet;
    },
    {},
  );

  return { hooks };
}

type NativeHookHandler = Record<string, unknown>;
type NativeHookGroup = { matcher?: string; hooks?: NativeHookHandler[] } & Record<string, unknown>;
type NativeHookConfig = Record<string, NativeHookGroup[]>;
type NativeHookDocument = { hooks?: NativeHookConfig } & Record<string, unknown>;

function buildAgentLumosHookHandler(state: LumosState): NativeHookHandler {
  return {
    type: "command",
    command: lumosCommandForState(state),
    commandWindows: lumosCommandForState(state),
    timeout: 10,
    statusMessage: `AgentLumos: ${state}`,
  };
}

function isAgentLumosHookHandler(handler: NativeHookHandler): boolean {
  return typeof handler.statusMessage === "string" && handler.statusMessage.startsWith("AgentLumos:");
}

function getHookConfigPath(target: HookIntegrationName): string {
  const codexOverride = process.env.AGENTLUMOS_CODEX_HOOKS_PATH;
  const claudeOverride = process.env.AGENTLUMOS_CLAUDE_CODE_SETTINGS_PATH;
  if (target === "codex" && codexOverride) {
    return codexOverride;
  }
  if (target === "claude-code" && claudeOverride) {
    return claudeOverride;
  }

  const home = os.homedir();
  if (target === "codex") {
    return path.join(home, ".codex", "hooks.json");
  }

  return path.join(home, ".claude", "settings.json");
}

function readJsonDocument(filePath: string): NativeHookDocument {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const contents = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(contents) as NativeHookDocument;
}

function writeJsonDocument(filePath: string, document: NativeHookDocument): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
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

function installAgentLumosHooks(target: HookIntegrationName, integration: HookIntegrationConfig): unknown {
  const filePath = getHookConfigPath(target);
  const current = readJsonDocument(filePath);
  const cleaned = removeAgentLumosHooks(current).document;
  const snippet = buildNativeHookSnippet(target, integration);
  const hooks: NativeHookConfig = { ...(cleaned.hooks ?? {}) };
  let installed = 0;

  for (const [eventName, groups] of Object.entries(snippet.hooks)) {
    hooks[eventName] = [...(hooks[eventName] ?? []), ...groups];
    installed += groups.reduce((count, group) => count + (group.hooks?.length ?? 0), 0);
  }

  writeJsonDocument(filePath, {
    ...cleaned,
    hooks,
  });

  return {
    target,
    installed,
    path: filePath,
  };
}

function uninstallAgentLumosHooks(target: HookIntegrationName): unknown {
  const filePath = getHookConfigPath(target);
  const current = readJsonDocument(filePath);
  const { document, removed } = removeAgentLumosHooks(current);
  writeJsonDocument(filePath, document);

  return {
    target,
    removed,
    path: filePath,
  };
}

function getAgentLumosHookState(handler: NativeHookHandler): LumosState | null {
  if (!isAgentLumosHookHandler(handler)) {
    return null;
  }

  const state = (handler.statusMessage as string).slice("AgentLumos:".length).trim();
  if (state === "idle" || state === "active" || state === "blocked" || state === "success" || state === "error") {
    return state;
  }

  return null;
}

function getInstalledAgentLumosEvents(document: NativeHookDocument): {
  managedHandlers: number;
  installedEvents: Record<string, LumosState[]>;
} {
  let count = 0;
  const installedEvents: Record<string, LumosState[]> = {};

  for (const [eventName, groups] of Object.entries(document.hooks ?? {})) {
    for (const group of groups) {
      const handlers = Array.isArray(group.hooks) ? group.hooks : [];
      for (const handler of handlers) {
        const state = getAgentLumosHookState(handler);
        if (state) {
          count += 1;
          installedEvents[eventName] = [...(installedEvents[eventName] ?? []), state];
        }
      }
    }
  }

  return { managedHandlers: count, installedEvents };
}

function lumosCommandForState(state: LumosState): string {
  return state === "idle" ? "lumos off" : `lumos ${state}`;
}

function commandExists(command: string): boolean {
  const pathValue = process.env.PATH ?? "";
  const pathExt = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM") : "";
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

function getTargetCommand(target: HookIntegrationName): string {
  return target === "codex" ? "codex" : "claude";
}

function getHookTargetCheck(target: HookIntegrationName, config: LumosConfig | null): HookTargetCheck {
  const toolInstalled = commandExists(getTargetCommand(target));
  const expectedEvents = config?.hookIntegrations[target].hooks ?? {};

  if (!toolInstalled) {
    return {
      toolInstalled,
      hookInstalled: false,
      hookCheckSkipped: true,
      skipReason: `${getTargetCommand(target)} command not found`,
      expectedEvents,
      installedEvents: {},
      missingEvents: [],
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
    };
  }

  if (!config) {
    return {
      toolInstalled,
      hookInstalled: false,
      hookCheckSkipped: true,
      skipReason: "AgentLumos config unavailable",
      expectedEvents,
      installedEvents: {},
      missingEvents: [],
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
    };
  }

  const filePath = getHookConfigPath(target);
  const exists = fs.existsSync(filePath);
  const writable = canWriteExistingPath(filePath);

  if (!exists) {
    const missingEvents = Object.keys(expectedEvents);
    return {
      toolInstalled,
      path: filePath,
      pathExists: exists,
      pathWritable: writable,
      hookInstalled: false,
      hookCheckSkipped: false,
      expectedEvents,
      installedEvents: {},
      missingEvents,
      extraEvents: [],
      mismatchedEvents: [],
      managedHandlers: 0,
    };
  }

  try {
    const { managedHandlers, installedEvents } = getInstalledAgentLumosEvents(readJsonDocument(filePath));
    const missingEvents = Object.entries(expectedEvents)
      .filter(([event, state]) => !(installedEvents[event] ?? []).includes(state))
      .map(([event]) => event);
    const extraEvents = Object.keys(installedEvents).filter((event) => !(event in expectedEvents));
    const mismatchedEvents = Object.entries(expectedEvents)
      .filter(([event, state]) => installedEvents[event] && !installedEvents[event].includes(state))
      .map(([event, state]) => ({ event, expected: state, actual: installedEvents[event] }));

    return {
      toolInstalled,
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
      toolInstalled,
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

function getHookCheckReport(daemonAvailable: boolean, config: LumosConfig | null): HookCheckReport {
  const agentLumos = {
    daemonReady: daemonAvailable,
    commandInstalled: commandExists("lumos"),
    configLoaded: config !== null,
  };
  const targets = {
    codex: getHookTargetCheck("codex", config),
    "claude-code": getHookTargetCheck("claude-code", config),
  };
  const issues: string[] = [];
  const nextSteps: string[] = [];

  if (!agentLumos.commandInstalled) {
    issues.push("lumos command not found in PATH.");
  }
  if (!daemonAvailable) {
    issues.push("AgentLumos daemon is not available.");
    nextSteps.push("Run lumos daemon restart.");
  }
  if (!config) {
    issues.push("AgentLumos hook configuration is not available.");
  }

  for (const [target, targetCheck] of Object.entries(targets)) {
    if (!targetCheck.toolInstalled) {
      issues.push(`${target} tool is not available.`);
      nextSteps.push(`Install ${getTargetCommand(target as HookIntegrationName)} before installing AgentLumos hooks.`);
      continue;
    }
    if (targetCheck.hookCheckSkipped) {
      continue;
    }
    if (targetCheck.error) {
      issues.push(`${target} hook config is not valid JSON: ${targetCheck.error}`);
      continue;
    }
    if (targetCheck.pathWritable === false) {
      issues.push(`${target} hook config path is not writable.`);
    }
    if (!targetCheck.hookInstalled) {
      if (targetCheck.missingEvents.length > 0) {
        issues.push(`${target} is missing AgentLumos hooks: ${targetCheck.missingEvents.join(", ")}.`);
      }
      if (targetCheck.extraEvents.length > 0) {
        issues.push(`${target} has extra AgentLumos hooks: ${targetCheck.extraEvents.join(", ")}.`);
      }
      nextSteps.push(`Run lumos hook install ${target}.`);
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

function formatAvailability(value: boolean): string {
  return value ? "found" : "not found";
}

function formatReady(value: boolean): string {
  return value ? "ready" : "not ready";
}

function getTargetTitle(target: HookIntegrationName): string {
  return target === "codex" ? "Codex" : "Claude Code";
}

function formatTargetEvents(events: Record<string, LumosState[]>): string {
  return Object.keys(events).join(", ");
}

function buildHookCheckView(report: HookCheckReport): HookCheckView {
  const sections: HookCheckViewSection[] = [
    {
      heading: "AgentLumos",
      rows: [
        { label: "Daemon", value: formatReady(report.agentLumos.daemonReady) },
        { label: "Command", value: `lumos ${formatAvailability(report.agentLumos.commandInstalled)}` },
        { label: "Config", value: report.agentLumos.configLoaded ? "available" : "unavailable" },
      ],
    },
  ];

  for (const [target, targetCheck] of Object.entries(report.targets) as Array<[HookIntegrationName, HookTargetCheck]>) {
    const rows: Array<{ label: string; value: string }> = [
      { label: "Tool", value: targetCheck.toolInstalled ? "installed" : "not installed" },
    ];

    if (targetCheck.hookCheckSkipped) {
      rows.push({ label: "Hooks", value: "skipped" });
      if (targetCheck.skipReason) {
        rows.push({ label: "Reason", value: targetCheck.skipReason });
      }
      sections.push({ heading: getTargetTitle(target), rows });
      continue;
    }

    rows.push({ label: "Hooks", value: targetCheck.hookInstalled ? "installed" : "not installed" });
    if (targetCheck.path) {
      rows.push({ label: "Config", value: targetCheck.path });
    }
    if (targetCheck.missingEvents.length > 0) {
      rows.push({ label: "Missing", value: targetCheck.missingEvents.join(", ") });
    }
    if (targetCheck.extraEvents.length > 0) {
      rows.push({ label: "Extra", value: targetCheck.extraEvents.join(", ") });
    }
    if (targetCheck.mismatchedEvents.length > 0) {
      rows.push({
        label: "Mismatch",
        value: targetCheck.mismatchedEvents
          .map((event) => `${event.event} expected ${event.expected}, found ${event.actual.join("|")}`)
          .join(", "),
      });
    }
    if (targetCheck.managedHandlers > 0) {
      rows.push({ label: "Handlers", value: String(targetCheck.managedHandlers) });
    }
    if (Object.keys(targetCheck.installedEvents).length > 0) {
      rows.push({ label: "Events", value: formatTargetEvents(targetCheck.installedEvents) });
    }

    sections.push({ heading: getTargetTitle(target), rows });
  }

  return {
    title: "AgentLumos Hook Check",
    sections,
    nextSteps: report.nextSteps,
    result: report.agentLumosHooksReady ? "ready" : "not ready",
  };
}

function formatHookCheckText(view: HookCheckView): string {
  const lines: string[] = [view.title];

  for (const section of view.sections) {
    lines.push("", section.heading);
    for (const row of section.rows) {
      lines.push(`  ${row.label}: ${row.value}`);
    }
  }

  if (view.nextSteps.length > 0) {
    lines.push("", "Next");
    for (const nextStep of view.nextSteps) {
      lines.push(`  - ${nextStep}`);
    }
  }

  lines.push("", `Result: ${view.result}`);
  return `${lines.join("\n")}\n`;
}

async function write(deps: CliDeps, chunk: string): Promise<void> {
  await deps.stdout.write(chunk);
}

async function writeError(deps: CliDeps, chunk: string): Promise<void> {
  await deps.stderr.write(chunk);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestWithAutoStart(
  deps: CliDeps,
  request: DaemonRequest,
  retryOnConnectFailure: boolean,
): Promise<DaemonResponse> {
  const client = deps.createClient();

  try {
    return await client.request(request);
  } catch (error) {
    if (!retryOnConnectFailure || !isConnectFailure(error)) {
      throw error;
    }

    await deps.spawnDaemon();

    let lastError: unknown = error;
    for (let attempt = 0; attempt < DAEMON_START_RETRY_COUNT; attempt += 1) {
      try {
        return await deps.createClient().request(request);
      } catch (retryError) {
        if (!isConnectFailure(retryError)) {
          throw retryError;
        }

        lastError = retryError;
        await sleep(DAEMON_START_RETRY_DELAY_MS);
      }
    }

    throw lastError;
  }
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const parsed = parseCommand(argv);
  try {
    if (parsed.local === "hook-check") {
      const statusResponse = await requestWithAutoStart(deps, { type: "getStatus" }, true).catch(() => null);
      const configResponse = await requestWithAutoStart(deps, { type: "getConfig" }, true).catch(() => null);
      const config = configResponse?.ok ? (configResponse.data as LumosConfig) : null;
      const report = getHookCheckReport(Boolean(statusResponse?.ok), config);
      await write(deps, parsed.json ? formatJson(report) : formatHookCheckText(buildHookCheckView(report)));
      return 0;
    }

    if (parsed.local === "hook-install") {
      if (!parsed.hookTarget) {
        throw new Error("Missing hook target.");
      }

      const response = await requestWithAutoStart(deps, { type: "getConfig" }, true);
      if (!response.ok) {
        await writeError(deps, formatWarning(response.message));
        return 2;
      }

      const config = response.data as LumosConfig;
      await write(deps, formatJson(installAgentLumosHooks(parsed.hookTarget, config.hookIntegrations[parsed.hookTarget])));
      return 0;
    }

    if (parsed.local === "hook-uninstall") {
      if (!parsed.hookTarget) {
        throw new Error("Missing hook target.");
      }

      await write(deps, formatJson(uninstallAgentLumosHooks(parsed.hookTarget)));
      return 0;
    }

    if (parsed.lifecycle === "daemon-restart") {
      await requestWithAutoStart(deps, { type: "shutdown" }, false).catch((error) => {
        if (!isConnectFailure(error)) {
          throw error;
        }
      });

      await deps.spawnDaemon();
      await waitForDaemonReady(deps);
      return 0;
    }

    if (!parsed.request) {
      throw new Error("No request to execute.");
    }

    const response = await requestWithAutoStart(deps, parsed.request, parsed.retryOnConnectFailure ?? true).catch((error) => {
      if (parsed.request?.type === "shutdown" && isConnectFailure(error)) {
        return { ok: true } as DaemonResponse;
      }

      throw error;
    });
    if (!response.ok) {
      await writeError(deps, formatWarning(response.message));
      switch (response.code) {
        case "driver_failed":
          return 3;
        case "daemon_error":
        case "ipc_error":
          return 2;
        default:
          return 1;
      }
    }

    if (response.warning) {
      await writeError(deps, formatWarning(response.warning));
    }

    if (parsed.afterResponse) {
      const output = parsed.afterResponse(response);
      if (output) {
        await write(deps, output);
      }
    }

    return 0;
  } catch (error) {
    await writeError(deps, formatWarning(error instanceof Error ? error.message : String(error)));
    return 2;
  }
}

async function waitForDaemonReady(deps: CliDeps): Promise<void> {
  for (let attempt = 0; attempt < DAEMON_START_RETRY_COUNT; attempt += 1) {
    try {
      const response = await deps.createClient().request({ type: "getStatus" });
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (!isConnectFailure(error)) {
        throw error;
      }
    }

    await sleep(DAEMON_START_RETRY_DELAY_MS);
  }

  throw new Error("Daemon did not become ready after restart.");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const pipePath = getDaemonPipePath();
  const daemonProcessPath = path.join(__dirname, "..", "daemon", "daemon-process.js");

  const exitCode = await runCli(argv, {
    createClient: () => createNamedPipeClient(pipePath),
    spawnDaemon: async () => {
      const { spawn } = await import("node:child_process");
      const child = spawn(process.execPath, [daemonProcessPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

if (require.main === module) {
  void main();
}
