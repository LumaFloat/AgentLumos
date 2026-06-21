import type { LedName } from "../../types";

export interface InputActivitySubscription {
  stop(): void;
}

export interface InputActivityMonitorStartOptions {
  onActivity(): void | Promise<void>;
  onIdle(): void | Promise<void>;
  quietMs: number;
  pollMs?: number;
  ignoredLeds?: readonly LedName[];
}

export interface InputActivityMonitor {
  name?: string;
  start(options: InputActivityMonitorStartOptions): InputActivitySubscription;
}

export function createNoopInputActivityMonitor(): InputActivityMonitor {
  return {
    name: "noop-input-activity",
    start() {
      return {
        stop() {},
      };
    },
  };
}
