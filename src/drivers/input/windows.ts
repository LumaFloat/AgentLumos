import koffi from "koffi";
import type { InputActivityMonitor, InputActivitySubscription } from "./activity-monitor";
import { createNoopInputActivityMonitor } from "./activity-monitor";
import type { LedName } from "../../types";

const VK_LBUTTON = 0x01;
const VK_XBUTTON2 = 0x06;
const VK_CAPITAL = 0x14;
const VK_NUMLOCK = 0x90;
const VK_SCROLL = 0x91;
const FIRST_INPUT_VK = VK_LBUTTON;
const LAST_VK = 0xfe;
const KEY_PRESSED_SINCE_LAST_CALL = 0x0001;
const KEY_CURRENTLY_DOWN = 0x8000;
const DEFAULT_POLL_MS = 50;
const LED_VIRTUAL_KEYS: Record<LedName, number> = {
  caps: VK_CAPITAL,
  num: VK_NUMLOCK,
  scroll: VK_SCROLL,
};

type Win32InputApi = {
  getAsyncKeyState(vKey: number): number;
};

let win32InputApi: Win32InputApi | null = null;

function getWin32InputApi(): Win32InputApi {
  if (win32InputApi) {
    return win32InputApi;
  }

  const user32 = koffi.load("user32.dll");
  const getAsyncKeyState = user32.func("short __stdcall GetAsyncKeyState(int vKey)");

  win32InputApi = {
    getAsyncKeyState(vKey: number) {
      return getAsyncKeyState(vKey) as number;
    },
  };

  return win32InputApi;
}

function isIgnoredVirtualKey(vKey: number, ignoredLedKeys: ReadonlySet<number>): boolean {
  return ignoredLedKeys.has(vKey);
}

function toIgnoredLedKeys(ignoredLeds: readonly LedName[] = []): ReadonlySet<number> {
  return new Set(ignoredLeds.map((led) => LED_VIRTUAL_KEYS[led]));
}

function hasKeyboardActivity(api: Win32InputApi, ignoredLeds: readonly LedName[] = []): boolean {
  const ignoredLedKeys = toIgnoredLedKeys(ignoredLeds);

  for (let vKey = FIRST_INPUT_VK; vKey <= LAST_VK; vKey += 1) {
    if (isIgnoredVirtualKey(vKey, ignoredLedKeys)) {
      continue;
    }

    const keyState = api.getAsyncKeyState(vKey);
    if ((keyState & KEY_PRESSED_SINCE_LAST_CALL) !== 0 || (keyState & KEY_CURRENTLY_DOWN) !== 0) {
      return true;
    }
  }

  return false;
}

function invoke(callback: () => void | Promise<void>): void {
  void Promise.resolve(callback()).catch(() => {
    // Activity monitoring must never take down the daemon.
  });
}

export function createWindowsInputActivityMonitor(): InputActivityMonitor {
  if (process.platform !== "win32") {
    return createNoopInputActivityMonitor();
  }

  return {
    name: "win32-getasync keystate",

    start({ onActivity, onIdle, quietMs, pollMs = DEFAULT_POLL_MS, ignoredLeds = [] }): InputActivitySubscription {
      const api = getWin32InputApi();
      let stopped = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      hasKeyboardActivity(api, ignoredLeds);

      const clearIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };

      const markActivity = () => {
        invoke(onActivity);
        clearIdleTimer();
        idleTimer = setTimeout(() => {
          idleTimer = null;
          if (!stopped) {
            invoke(onIdle);
          }
        }, quietMs);
      };

      const interval = setInterval(() => {
        if (hasKeyboardActivity(api, ignoredLeds)) {
          markActivity();
        }
      }, pollMs);

      interval.unref?.();

      return {
        stop() {
          stopped = true;
          clearInterval(interval);
          clearIdleTimer();
        },
      };
    },
  };
}

export { hasKeyboardActivity };
