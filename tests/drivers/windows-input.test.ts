import { describe, expect, it } from "vitest";
import { hasKeyboardActivity } from "../../src/drivers/input/windows";

const VK_CAPITAL = 0x14;
const VK_LBUTTON = 0x01;
const VK_NUMLOCK = 0x90;

function createApi(pressedKey: number, state = 1) {
  return {
    getAsyncKeyState(vKey: number) {
      return vKey === pressedKey ? state : 0;
    },
  };
}

describe("Windows input activity monitor", () => {
  it("ignores only the Lock LEDs used by the current effect", () => {
    expect(hasKeyboardActivity(createApi(VK_NUMLOCK), ["caps"])).toBe(true);
    expect(hasKeyboardActivity(createApi(VK_NUMLOCK), ["num"])).toBe(false);
    expect(hasKeyboardActivity(createApi(VK_CAPITAL), ["caps"])).toBe(false);
  });

  it("treats mouse button clicks and held buttons as input activity", () => {
    expect(hasKeyboardActivity(createApi(VK_LBUTTON))).toBe(true);
    expect(hasKeyboardActivity(createApi(VK_LBUTTON, 0x8000))).toBe(true);
  });
});
