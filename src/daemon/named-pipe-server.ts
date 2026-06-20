import fs from "node:fs";
import net from "node:net";
import type { DaemonRequest, DaemonResponse } from "../types";

type Handler = (request: DaemonRequest) => Promise<DaemonResponse> | DaemonResponse;
const memoryServers = new Map<string, Handler>();

export function createNamedPipeServer(pipePath: string, handler: Handler) {
  if (pipePath.startsWith("memory:")) {
    return {
      async start() {
        memoryServers.set(pipePath, handler);
      },
      async close() {
        memoryServers.delete(pipePath);
      },
    };
  }

  const server = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", async (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const rawRequest = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      try {
        const request = JSON.parse(rawRequest) as DaemonRequest;
        const response = await handler(request);
        socket.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        const response: DaemonResponse = {
          ok: false,
          code: "ipc_error",
          message: error instanceof Error ? error.message : String(error),
        };
        socket.write(`${JSON.stringify(response)}\n`);
      } finally {
        socket.end();
      }
    });
  });

  return {
    async start() {
      if (process.platform !== "win32") {
        try {
          fs.rmSync(pipePath);
        } catch {
          // Ignore stale socket cleanup failures.
        }
      }

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(pipePath, () => resolve());
      });
    },

    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

export function getMemoryPipeHandler(pipePath: string): Handler | undefined {
  return memoryServers.get(pipePath);
}
