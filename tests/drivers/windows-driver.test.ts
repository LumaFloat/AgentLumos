import { describe, expect, it } from "vitest";
import { createWindowsKeyboardDriver } from "../../src/drivers/keyboard/windows";

const itOnWindows = process.platform === "win32" ? it : it.skip;
const itOutsideWindows = process.platform === "win32" ? it.skip : it;

describe("createWindowsKeyboardDriver", () => {
  itOutsideWindows("reports unsupported_platform outside Windows", async () => {
    const driver = createWindowsKeyboardDriver();

    await expect(driver.readState()).rejects.toMatchObject({
      code: "unsupported_platform",
    });

    await expect(
      driver.setState({
        caps: true,
        num: false,
        scroll: false,
      }),
    ).rejects.toMatchObject({
      code: "unsupported_platform",
    });
  });

  itOnWindows("reads the current Windows Lock state", async () => {
    const driver = createWindowsKeyboardDriver();
    const state = await driver.readState();

    expect(typeof state.caps).toBe("boolean");
    expect(typeof state.num).toBe("boolean");
    expect(typeof state.scroll).toBe("boolean");
  });
});
