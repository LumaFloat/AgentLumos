import { describe, expect, it } from "vitest";
import { createNamedPipeClient } from "../../src/daemon/named-pipe-client";
import { createNamedPipeServer } from "../../src/daemon/named-pipe-server";

describe("named pipe IPC", () => {
  it("round trips a daemon request and response", async () => {
    const socketPath = "memory:agentlumos-ipc-test";

    const server = createNamedPipeServer(socketPath, async (request) => ({
      ok: true as const,
      data: request.type,
    }));

    await server.start();

    const client = createNamedPipeClient(socketPath);
    const response = await client.request({ type: "getStatus" });

    expect(response).toEqual({ ok: true, data: "getStatus" });

    await server.close();
  });
});
