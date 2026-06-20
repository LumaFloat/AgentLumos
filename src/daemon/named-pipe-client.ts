import net from "node:net";
import type { DaemonRequest, DaemonResponse } from "../types";
import { getMemoryPipeHandler } from "./named-pipe-server";

async function readLine(socket: net.Socket): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("error", onError);
    };

    const finish = (value: string) => {
      cleanup();
      resolve(value);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex >= 0) {
        finish(buffer.slice(0, newlineIndex));
      }
    };

    const onEnd = () => {
      if (buffer.length > 0) {
        finish(buffer);
        return;
      }

      cleanup();
      reject(new Error("Connection closed before a response was received."));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.on("data", onData);
    socket.on("end", onEnd);
    socket.on("error", onError);
  });
}

export function createNamedPipeClient(pipePath: string) {
  return {
    async request(request: DaemonRequest): Promise<DaemonResponse> {
      if (pipePath.startsWith("memory:")) {
        const handler = getMemoryPipeHandler(pipePath);
        if (!handler) {
          throw new Error(`No in-memory IPC server is listening on ${pipePath}.`);
        }

        return await handler(request);
      }

      return new Promise<DaemonResponse>((resolve, reject) => {
        const socket = net.createConnection(pipePath);

        socket.once("error", reject);
        socket.once("connect", async () => {
          try {
            socket.write(`${JSON.stringify(request)}\n`);
            const responseText = await readLine(socket);
            socket.end();
            resolve(JSON.parse(responseText) as DaemonResponse);
          } catch (error) {
            socket.destroy();
            reject(error);
          }
        });
      });
    },
  };
}
