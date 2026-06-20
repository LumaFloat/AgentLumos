import type { LockState } from "../../types";

export interface KeyboardDriver {
  name?: string;
  readState(): Promise<LockState>;
  setState(nextState: LockState): Promise<void>;
}
