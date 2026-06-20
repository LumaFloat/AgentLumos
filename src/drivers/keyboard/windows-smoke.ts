import { createWindowsKeyboardDriver } from "./windows";
import type { LockState } from "../../types";

export async function smokeWindowsKeyboardDriver(): Promise<void> {
  const driver = createWindowsKeyboardDriver();
  const original = await driver.readState();

  const toggled: LockState = {
    caps: !original.caps,
    num: !original.num,
    scroll: !original.scroll,
  };

  await driver.setState(toggled);
  await driver.setState(original);
}
