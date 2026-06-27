import { loadConfig, resetConfig, updateConfig } from "../config/config";
import type {
  ActiveLumosState,
  AnimationName,
  AnimationSpeed,
  DaemonRequest,
  DaemonResponse,
  LedName,
  LumosAnimationConfig,
  LumosConfig,
  VisualProfileLayout,
} from "../types";
import { parseTtl, parseTtlOrZero } from "../core/duration";

interface DaemonController {
  setState(
    state: "idle" | ActiveLumosState,
    animationName?: AnimationName,
    animation?: LumosAnimationConfig,
    speed?: AnimationSpeed,
    configuredLeds?: readonly LedName[],
    ttlMs?: number,
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

      const config = loadConfig(configPath);
      const stateConfig = config.states[request.state];
      const configuredLeds = request.overrides?.leds ?? config.leds;
      const profileLayout = resolveVisualProfileLayout(config, request.state, configuredLeds);
      const animationName = profileLayout.animation;
      const animation = config.animations[animationName];
      if (!animation) {
        throw new Error(`Unknown animation: ${animationName}`);
      }
      const ttlMs = request.ttlMs ?? parseTtlOrZero(stateConfig.ttl ?? config.defaultTtl);
      await daemon.setState(request.state, animationName, animation, profileLayout.speed, configuredLeds, ttlMs);
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
      const configuredLeds = request.overrides?.leds ?? config.leds;
      await runConfiguredState(daemon, config, "active", configuredLeds, "2s");
      await daemon.waitForIdle();
      await runConfiguredState(daemon, config, "blocked", configuredLeds, "2s");
      await daemon.waitForIdle();
      await runConfiguredState(daemon, config, "success", configuredLeds, "2s");
      await daemon.waitForIdle();
      await runConfiguredState(daemon, config, "error", configuredLeds, "2s");
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
  state: ActiveLumosState,
  configuredLeds: readonly LedName[],
): VisualProfileLayout {
  if (configuredLeds.length === 1) {
    return config.visualProfiles[state].oneLed;
  }

  if (configuredLeds.length === 2) {
    return config.visualProfiles[state].twoLed;
  }

  if (configuredLeds.length === 3) {
    return config.visualProfiles[state].threeLed;
  }

  throw new Error(`Expected 1 to 3 configured LEDs, got ${configuredLeds.length}.`);
}

async function runConfiguredState(
  daemon: DaemonController,
  config: LumosConfig,
  state: ActiveLumosState,
  configuredLeds: readonly LedName[],
  ttl: string,
): Promise<void> {
  const profileLayout = resolveVisualProfileLayout(config, state, configuredLeds);
  const animationName = profileLayout.animation;
  const animation = config.animations[animationName];
  if (!animation) {
    throw new Error(`Unknown animation: ${animationName}`);
  }

  await daemon.setState(state, animationName, animation, profileLayout.speed, configuredLeds, parseTtl(ttl));
}
