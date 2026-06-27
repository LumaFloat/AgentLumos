import { loadConfig, resetConfig, updateConfig } from "../config/config";
import { parseTtl, parseTtlOrZero } from "../core/duration";
import { assertValidStateKind } from "../state";
import type {
  ActiveLumosState,
  DaemonRequest,
  DaemonResponse,
  LedName,
  LumosConfig,
  LumosAnimationConfig,
  LumosStateOverride,
  LumosStateKind,
  VisualProfileKey,
  VisualProfileLayout,
} from "../types";
import type { AnimationName, AnimationSpeed } from "../types";

interface ResolvedEffect {
  animationName: AnimationName;
  animation: LumosAnimationConfig;
  speed: AnimationSpeed;
  configuredLeds: readonly LedName[];
}

interface DaemonController {
  setState(
    state: "idle" | ActiveLumosState,
    animationName?: AnimationName,
    animation?: LumosAnimationConfig,
    speed?: AnimationSpeed,
    configuredLeds?: readonly LedName[],
    ttlMs?: number,
    kind?: LumosStateKind,
    ignoreInputSuppression?: boolean,
  ): Promise<void>;
  pokeLed(led: LedName): Promise<void>;
  getStatus(): unknown | Promise<unknown>;
  shutdown(): Promise<void>;
  waitForIdle(): Promise<void>;
}

function ok(data?: unknown, warning?: string): DaemonResponse {
  return warning ? { ok: true, warning, data } : { ok: true, data };
}

export async function handleDaemonRequest(
  daemon: DaemonController,
  configPath: string,
  request: DaemonRequest,
): Promise<DaemonResponse> {
  try {
    if (request.type === "setState") {
      if (request.state === "idle") {
        await daemon.setState("idle");
        return ok();
      }

      assertValidStateKind(request.state, request.kind);
      const config = loadConfig(configPath);
      const stateConfig = config.states[request.state];
      const effect = resolveConfiguredEffect(config, request.state, request.kind, request.overrides);
      const ttlMs = request.ttlMs ?? parseTtlOrZero(stateConfig.ttl ?? config.defaultTtl);
      await daemon.setState(
        request.state,
        effect.animationName,
        effect.animation,
        effect.speed,
        effect.configuredLeds,
        ttlMs,
        request.kind,
        request.ignoreInputSuppression,
      );
      return ok();
    }

    if (request.type === "getStatus") {
      return ok(await daemon.getStatus());
    }

    if (request.type === "getConfig") {
      return ok(loadConfig(configPath));
    }

    if (request.type === "setConfig") {
      const patch = request.patch;
      const updated = updateConfig(configPath, patch);
      return ok(updated);
    }

    if (request.type === "resetConfig") {
      return ok(resetConfig(configPath));
    }

    if (request.type === "shutdown") {
      return ok();
    }

    if (request.type === "pokeLed") {
      await daemon.pokeLed(request.led);
      return ok();
    }

    if (request.type === "runDemo") {
      const config = loadConfig(configPath);
      await runConfiguredState(daemon, config, "working", request.overrides, "3s", request.ignoreInputSuppression);
      await daemon.waitForIdle();
      await runConfiguredState(daemon, config, "blocked", request.overrides, "3s", request.ignoreInputSuppression);
      await daemon.waitForIdle();
      await runConfiguredState(daemon, config, "success", request.overrides, "3s", request.ignoreInputSuppression);
      await daemon.waitForIdle();
      await runConfiguredState(daemon, config, "error", request.overrides, "3s", request.ignoreInputSuppression);
      await daemon.waitForIdle();
      await daemon.setState("idle");
      return ok();
    }

    return {
      ok: false,
      code: "input_error",
      message: `Unsupported request type: ${(request as { type: string }).type}`,
    };
  } catch (error) {
    return {
      ok: false,
      code: "daemon_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveVisualProfileLayout(
  config: LumosConfig,
  profileKey: VisualProfileKey,
  configuredLeds: readonly LedName[],
): VisualProfileLayout {
  const profile = config.visualProfiles[profileKey];
  if (!profile) {
    throw new Error(`Missing visual profile: ${profileKey}.`);
  }

  if (configuredLeds.length === 1) {
    return profile.oneLed;
  }

  if (configuredLeds.length === 2) {
    return profile.twoLed;
  }

  if (configuredLeds.length === 3) {
    return profile.threeLed;
  }

  throw new Error(`Expected 1 to 3 configured LEDs, got ${configuredLeds.length}.`);
}

function resolveConfiguredEffect(
  config: LumosConfig,
  state: ActiveLumosState,
  kind?: LumosStateKind,
  overrides?: LumosStateOverride,
): ResolvedEffect {
  const configuredLeds = overrides?.leds ?? config.leds;
  const profileKey = kind ? `${state}.${kind}` as VisualProfileKey : state;
  const profileLayout = resolveVisualProfileLayout(config, profileKey, configuredLeds);
  const animationName = profileLayout.animation;
  const animation = config.animations[animationName];
  if (!animation) {
    throw new Error(`Unknown animation: ${animationName}`);
  }

  return {
    animationName,
    animation,
    speed: profileLayout.speed,
    configuredLeds,
  };
}

async function runConfiguredState(
  daemon: DaemonController,
  config: LumosConfig,
  state: ActiveLumosState,
  overrides: LumosStateOverride | undefined,
  ttl: string,
  ignoreInputSuppression = false,
): Promise<void> {
  const effect = resolveConfiguredEffect(config, state, undefined, overrides);
  await daemon.setState(
    state,
    effect.animationName,
    effect.animation,
    effect.speed,
    effect.configuredLeds,
    parseTtl(ttl),
    undefined,
    ignoreInputSuppression,
  );
}
