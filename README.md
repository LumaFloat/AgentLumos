# AgentLumos

English | [简体中文](README.zh-CN.md)

> Status indicators for AI coding agents.

[![npm](https://img.shields.io/npm/v/agentlumos.svg)](https://www.npmjs.com/package/agentlumos)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4.svg)](#platform-and-hardware-support)

AgentLumos shows the runtime state of AI coding agents. The initial feature set turns the Caps Lock, Num Lock, and Scroll Lock LEDs on a physical keyboard into a small status display for tools like Codex and Claude Code.

It does not wrap your agent, replace your terminal, or add another screen overlay. It listens to native hook events and plays short LED animations so you can tell, from your peripheral vision, whether the agent is working, blocked, done, or failed.

```text
active   [●○○] [○●○] [○○●]   agent is working
blocked  [●●○] [○●●] [●○●]   waiting for input or permission
success  [○●○] [●●●] [○●○]   task completed
error    [●●●] [○○○] [●●●]   task failed
```

## Why "Lumos"?

"Lumos" means bringing light to otherwise invisible background work. AgentLumos makes agent activity visible through the small Lock LEDs already on your keyboard.

## Highlights

- **Ambient feedback**: see agent state without keeping the terminal in focus.
- **Hook driven**: maps Codex and Claude Code hook events to LED states.
- **No extra hardware for the initial setup**: uses the Lock indicator LEDs already on many keyboards.
- **Restores state**: captures the original Lock state and restores it after animations.
- **Quiet while interacting**: temporarily suppresses LED animations while you type or click/drag the mouse, restores the original Lock state, and resumes after a short idle window if the agent state is still active.
- **State leases**: `active` now defaults to a 10 minute lease and renews on new hooks; `blocked`, `success`, and `error` default to 60 seconds, 10 seconds, and 20 seconds so stale states do not linger.
- **Configurable**: choose LED order, state TTLs, animations, and hook mappings.
- **Windows native**: uses the current Windows keyboard Lock behavior.

## Install

Clone the repository and install the CLI:

```powershell
# Install dependencies.
npm install

# Build the CLI.
npm run build

# Register the local lumos command globally.
npm install -g .
```

Requires Node.js 20 or newer.

## 30-second test

Run these commands from PowerShell:

```powershell
# Check daemon status and current LED state.
lumos status

# Play built-in animations.
lumos demo

# Set the physical LED order from left to right.
lumos config set leds num,caps,scroll

# Show the active animation for 5 seconds.
lumos active --ttl 5

# Show the blocked animation for 5 seconds.
lumos blocked --ttl 5

# Show the success animation.
lumos success

# Show the error animation.
lumos error

# Stop animation and restore the original Lock state.
lumos off
```

If your keyboard exposes fewer Lock LEDs, configure only the usable ones:

```powershell
# Use only the Caps Lock LED.
lumos config set leds caps

# Use Caps Lock and Num Lock LEDs.
lumos config set leds caps,num
```

## Agent hooks

AgentLumos can install managed hook handlers for supported agent tools.

```powershell
# Check whether AgentLumos hooks are ready.
lumos hook check

# Install Codex hook handlers.
lumos hook install codex

# Install Claude Code hook handlers.
lumos hook install claude-code
```

Default mappings:

| Tool | Events |
| --- | --- |
| Codex | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop` |
| Claude Code | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure`, `SessionEnd` |

Read the setup guides:

- [Codex hooks](docs/hooks/codex.md)
- [Claude Code hooks](docs/hooks/claude-code.md)

## CLI

| Command | Purpose |
| --- | --- |
| `lumos status` | Show daemon state, selected LEDs, current animation, TTL, driver, and last error. |
| `lumos demo` | Play the built-in demo sequence. |
| `lumos active` | Show the agent working state. |
| `lumos blocked` | Show the waiting-for-user state. |
| `lumos success` | Show the completion state. |
| `lumos error` | Show the failure state. |
| `lumos off` | Stop the animation and restore the original Lock state. |
| `lumos config get` | Print the current config. |
| `lumos config clean` | Delete the config file so defaults are regenerated next time. |
| `lumos hook check --json` | Print hook readiness as structured JSON. |

## Configuration

On Windows, AgentLumos stores config at:

```text
%APPDATA%\AgentLumos\config.json
```

Important fields:

| Field | Meaning |
| --- | --- |
| `leds` | Physical Lock LED order from left to right. |
| `states` | Animation and TTL for each state. |
| `animations` | Reusable LED animation definitions. |
| `hookIntegrations` | Agent hook event to AgentLumos state mappings. |

In `lumos status`, `effectSuppressed` means the logical state is still active, but LED animation is temporarily quiet because keyboard or mouse-button activity was detected. `pendingReminder` means the latest finite `blocked`, `success`, or `error` state expired while quiet and is waiting to replay once input becomes idle. Mouse movement and wheel scrolling are not used for suppression.

Lease behavior:

- `active` renews on every matching hook and never replays after expiry.
- `blocked`, `success`, and `error` keep their latest lease while quiet, and the newest expired one may replay once after input becomes idle.
- Deferred replay lasts at least 5s for `blocked`, 3s for `success`, and 5s for `error`.
- Deferred reminders older than 5 minutes are discarded.
- `lumos off` clears both visible and pending state.

Use `lumos config clean` to remove the current config and let AgentLumos regenerate the default config on the next launch.

## Platform and Hardware Support

AgentLumos is currently Windows-first. The current driver targets keyboard Lock LEDs through Windows input behavior.

Linux and macOS support are not implemented yet. Some keyboards, laptop firmware, KVMs, remote desktops, and vendor utilities may expose Lock state differently or not expose visible Lock LEDs at all.

The broader direction is to make agent state visible through glanceable hardware indicators. Future work may explore keyboard backlight or RGB zones where vendor support is practical, dedicated external status-light hardware, cross-platform drivers, stronger interrupted-session recovery, broader keyboard compatibility notes, and more integrations.

## Documentation

- [Chinese README](README.zh-CN.md)
- [Chinese docs](docs/zh-CN/)
- [Windows manual test guide](docs/manual-windows-test.md)
- [Codex hook guide](docs/hooks/codex.md)
- [Claude Code hook guide](docs/hooks/claude-code.md)

## Development

```powershell
# Install dependencies.
npm install

# Run tests.
npm test

# Build TypeScript output.
npm run build

# Register the local lumos command globally.
npm install -g .
```

## Contributing

Issues, bug reports, keyboard compatibility notes, and hook mapping improvements are welcome.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the public contribution workflow.

## License

Apache-2.0. See [LICENSE](LICENSE).
