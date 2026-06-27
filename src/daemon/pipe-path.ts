const DAEMON_PIPE_VERSION = "v3";

export function getDaemonPipePath(instanceName = "agentlumos"): string {
  const pipeName = `${instanceName}-${DAEMON_PIPE_VERSION}`;
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${pipeName}`;
  }

  return `\u0000${pipeName}`;
}
