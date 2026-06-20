import { describe, expect, it } from "vitest";
import { createFakeKeyboardDriver } from "../../src/drivers/keyboard/fake";
import type { LockState } from "../../src/types";

const initialState: LockState = {
  caps: false,
  num: true,
  scroll: false,
};

describe("createFakeKeyboardDriver", () => {
  it("reads and writes logical lock state", async () => {
    const driver = createFakeKeyboardDriver(initialState);

    expect(await driver.readState()).toEqual(initialState);

    const nextState: LockState = {
      caps: true,
      num: false,
      scroll: true,
    };
    await driver.setState(nextState);

    expect(await driver.readState()).toEqual(nextState);
  });

  it("records written states in order", async () => {
    const driver = createFakeKeyboardDriver(initialState);

    await driver.setState({
      caps: true,
      num: true,
      scroll: false,
    });
    await driver.setState({
      caps: true,
      num: false,
      scroll: false,
    });

    expect(driver.getWriteHistory()).toEqual([
      { caps: true, num: true, scroll: false },
      { caps: true, num: false, scroll: false },
    ]);
  });
});
