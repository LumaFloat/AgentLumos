import { loadConfig, resetConfig, updateConfig } from "../config/config";
import type { ActiveLumosState, AnimationName, DaemonRequest, DaemonResponse, LedName, LumosAnimationConfig } from "../types";
import { parseTtl, parseTtlOrZero } from "../core/duration";

interface DaemonController {
  setState(
    state: "idle" | ActiveLumosState,
    animationName?: AnimationName,
    animation?: LumosAnimationConfig,
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
      const animationName = request.overrides?.animation ?? stateConfig.animation;
      const animation = config.animations[animationName];
      if (!animation) {
        throw new Error(`Unknown animation: ${animationName}`);
      }
      const ttlMs = request.ttlMs ?? parseTtlOrZero(stateConfig.ttl ?? config.defaultTtl);
      await daemon.setState(request.state, animationName, animation, request.overrides?.leds ?? config.leds, ttlMs);
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
      await runConfiguredState(daemon, "active", config.states.active.animation, config.animations[config.states.active.animation], config.leds, "2s");
      await daemon.waitForIdle();
      await runConfiguredState(daemon, "blocked", config.states.blocked.animation, config.animations[config.states.blocked.animation], config.leds, "2s");
      await daemon.waitForIdle();
      await runConfiguredState(daemon, "success", config.states.success.animation, config.animations[config.states.success.animation], config.leds, "2s");
      await daemon.waitForIdle();
      await runConfiguredState(daemon, "error", config.states.error.animation, config.animations[config.states.error.animation], config.leds, "2s");
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

async function runConfiguredState(
  daemon: DaemonController,
  state: ActiveLumosState,
  animationName: AnimationName,
  animation: LumosAnimationConfig | undefined,
  configuredLeds: readonly LedName[],
  ttl: string,
): Promise<void> {
  if (!animation) {
    throw new Error(`Unknown animation: ${animationName}`);
  }

  await daemon.setState(state, animationName, animation, configuredLeds, parseTtl(ttl));
}
