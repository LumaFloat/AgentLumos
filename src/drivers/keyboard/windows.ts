import koffi from "koffi";
import type { KeyboardDriver } from "./driver";
import type { LockState } from "../../types";

const VK_CAPITAL = 0x14;
const VK_NUMLOCK = 0x90;
const VK_SCROLL = 0x91;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;

type Win32Api = {
  getKeyState(vKey: number): number;
  sendInput(inputs: KeyboardInputEvent[]): number;
};

type KeyboardInputEvent = {
  type: number;
  u: {
    ki: {
      wVk: number;
      wScan: number;
      dwFlags: number;
      time: number;
      dwExtraInfo: number;
    };
  };
};

let win32Api: Win32Api | null = null;

class WindowsKeyboardDriverError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WindowsKeyboardDriverError";
    this.code = code;
  }
}

function unsupportedPlatform(): WindowsKeyboardDriverError {
  return new WindowsKeyboardDriverError(
    "unsupported_platform",
    "Windows keyboard driver is only available on Windows.",
  );
}

function getWin32Api(): Win32Api {
  if (win32Api) {
    return win32Api;
  }

  const user32 = koffi.load("user32.dll");
  const getKeyState = user32.func("short __stdcall GetKeyState(int nVirtKey)");

  const mouseInput = koffi.struct("MOUSEINPUT", {
    dx: "long",
    dy: "long",
    mouseData: "uint32_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
  });
  const keyboardInput = koffi.struct("KEYBDINPUT", {
    wVk: "uint16_t",
    wScan: "uint16_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
  });
  const hardwareInput = koffi.struct("HARDWAREINPUT", {
    uMsg: "uint32_t",
    wParamL: "uint16_t",
    wParamH: "uint16_t",
  });
  const input = koffi.struct("INPUT", {
    type: "uint32_t",
    u: koffi.union({
      mi: mouseInput,
      ki: keyboardInput,
      hi: hardwareInput,
    }),
  });

  const sendInput = user32.func("unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)");

  win32Api = {
    getKeyState(vKey: number) {
      return getKeyState(vKey) as number;
    },
    sendInput(inputs: KeyboardInputEvent[]) {
      return sendInput(inputs.length, inputs, koffi.sizeof(input)) as number;
    },
  };

  return win32Api;
}

async function readWindowsLockState(): Promise<LockState> {
  const api = getWin32Api();
  return {
    caps: (api.getKeyState(VK_CAPITAL) & 1) !== 0,
    num: (api.getKeyState(VK_NUMLOCK) & 1) !== 0,
    scroll: (api.getKeyState(VK_SCROLL) & 1) !== 0,
  };
}

async function setWindowsLockState(desiredState: LockState): Promise<void> {
  const currentState = await readWindowsLockState();
  const toggles: number[] = [];

  if (desiredState.caps !== currentState.caps) {
    toggles.push(VK_CAPITAL);
  }
  if (desiredState.num !== currentState.num) {
    toggles.push(VK_NUMLOCK);
  }
  if (desiredState.scroll !== currentState.scroll) {
    toggles.push(VK_SCROLL);
  }

  if (toggles.length === 0) {
    return;
  }

  const inputs = toggles.flatMap((vKey) => [createKeyboardInput(vKey, 0), createKeyboardInput(vKey, KEYEVENTF_KEYUP)]);
  const sent = getWin32Api().sendInput(inputs);

  if (sent !== inputs.length) {
    throw new WindowsKeyboardDriverError("driver_failed", `SendInput sent ${sent} of ${inputs.length} keyboard events.`);
  }
}

function createKeyboardInput(vKey: number, flags: number): KeyboardInputEvent {
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vKey,
        wScan: 0,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

export function createWindowsKeyboardDriver(): KeyboardDriver {
  if (process.platform !== "win32") {
    return {
      name: "win32-sendinput",

      async readState() {
        throw unsupportedPlatform();
      },
      async setState() {
        throw unsupportedPlatform();
      },
    };
  }

  return {
    name: "win32-sendinput",
    readState: readWindowsLockState,
    setState: setWindowsLockState,
  };
}

export { WindowsKeyboardDriverError, readWindowsLockState, setWindowsLockState };
