import os from "node:os";
import { getConfigPath } from "../config/config";
import { createLumosDaemon } from "./daemon";
import { createNamedPipeServer } from "./named-pipe-server";
import { getDaemonPipePath } from "./pipe-path";
import { handleDaemonRequest } from "./ipc-handler";
import { createWindowsKeyboardDriver } from "../drivers/keyboard/windows";
import { createWindowsInputActivityMonitor } from "../drivers/input/windows";
import type { DaemonRequest } from "../types";

const pipePath = getDaemonPipePath();
const configPath = getConfigPath(process.env.APPDATA ?? os.tmpdir());

if (process.platform !== "win32") {
  throw new Error(
    `AgentLumos keyboard LED control is not supported on ${process.platform}. Physical LED effects currently require Windows.`,
  );
}

const driver = createWindowsKeyboardDriver();

const daemon = createLumosDaemon({
  driver,
  configuredLeds: ["caps", "num", "scroll"],
  inputActivityMonitor: createWindowsInputActivityMonitor(),
});

const server = createNamedPipeServer(pipePath, async (request: DaemonRequest) => {
  const response = await handleDaemonRequest(daemon, configPath, request);

  if (request.type === "shutdown" && response.ok) {
    setImmediate(() => {
      void shutdown().finally(() => {
        process.exit(0);
      });
    });
  }

  return response;
});

async function shutdown(): Promise<void> {
  await daemon.shutdown();
  await server.close();
}

async function main(): Promise<void> {
  await server.start();

  process.on("SIGINT", () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    void shutdown().finally(() => {
      process.exit(0);
    });
  });

  await new Promise<void>(() => {
    // Keep the daemon process alive until a signal closes it.
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
