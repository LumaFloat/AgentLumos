import { describe, expect, it } from "vitest";
import { hasKeyboardActivity } from "../../src/drivers/input/windows";

const VK_CAPITAL = 0x14;
const VK_NUMLOCK = 0x90;

function createApi(pressedKey: number) {
  return {
    getAsyncKeyState(vKey: number) {
      return vKey === pressedKey ? 1 : 0;
    },
  };
}

describe("Windows input activity monitor", () => {
  it("ignores only the Lock LEDs used by the current effect", () => {
    expect(hasKeyboardActivity(createApi(VK_NUMLOCK), ["caps"])).toBe(true);
    expect(hasKeyboardActivity(createApi(VK_NUMLOCK), ["num"])).toBe(false);
    expect(hasKeyboardActivity(createApi(VK_CAPITAL), ["caps"])).toBe(false);
  });
});
