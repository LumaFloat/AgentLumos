import type { KeyboardDriver } from "./driver";
import type { LockState } from "../../types";

export interface FakeKeyboardDriver extends KeyboardDriver {
  getWriteHistory(): LockState[];
}

function cloneState(state: LockState): LockState {
  return { ...state };
}

export function createFakeKeyboardDriver(initialState: LockState): FakeKeyboardDriver {
  let currentState = cloneState(initialState);
  const writeHistory: LockState[] = [];

  return {
    name: "fake",

    async readState() {
      return cloneState(currentState);
    },

    async setState(nextState: LockState) {
      currentState = cloneState(nextState);
      writeHistory.push(cloneState(nextState));
    },

    getWriteHistory() {
      return writeHistory.map(cloneState);
    },
  };
}
