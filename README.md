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
working   [●○○] [○●○] [○○●]   agent is working
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
- **Quiet while interacting**: temporarily suppresses LED animations while you type or click/drag the mouse, restores the original Lock state, and resumes after a short idle window if the agent state is still working.
- **State leases**: `working` now defaults to a 10 minute lease and renews on new hooks; `blocked`, `success`, and `error` default to 60 seconds, 10 seconds, and 20 seconds so stale states do not linger.
- **Configurable**: choose LED order, state TTLs, visual profiles, animations, and hook mappings.
- **Windows native**: uses the current Windows keyboard Lock behavior.

## Install

Install the CLI from npm:

```powershell
npm install -g agentlumos
```

Requires Node.js 20 or newer.

## Quick Start

Run these commands from PowerShell:

```powershell
# Check daemon status and current LED state.
lumos status

# Preview the built-in animation sequence.
lumos show

# Explicitly preview all state effects, optionally with a temporary layout.
lumos show demo
lumos show demo --leds c

# Preview a specific state kind.
lumos show working.command
lumos show error -k critical

# Set the physical LED order from left to right.
lumos config set leds n,c,s

# Install the hook for the agent you use.
lumos hook install codex
lumos hook install claude-code

# Check whether AgentLumos and agent hooks are ready.
lumos hook check
```

## Basic Usage

Usually you only need to configure the visible Lock LEDs on your keyboard, then install the hook for the agent you use. After that, Codex or Claude Code hooks trigger `working`, `blocked`, `success`, and `error` automatically. You should not need to run state commands manually during normal use.

State commands use the configured LED order. Use `lumos show --leds ...` for temporary layout previews without changing saved config.

### 1. Configure Your Keyboard LEDs

First run `lumos show` to see which lights move, then run `lumos config set leds ...` to match the physical LED order from left to right.

If your keyboard exposes fewer Lock LEDs, configure only the usable ones:

```powershell
# Use only the Caps Lock LED.
lumos config set leds c

# Use Caps Lock and Num Lock LEDs.
lumos config set leds c,n

# Common three-LED keyboard: use your actual left-to-right order.
lumos config set leds n,c,s
```

LED CLI values accept full names (`caps`, `num`, `scroll`) or short aliases (`c`, `n`, `s`). Saved config is normalized to full names.

AgentLumos uses visual profiles to choose an animation and speed for one-, two-, and three-LED layouts. Profiles are explicit for both baseline states such as `working` and built-in state kinds such as `working.command` or `error.critical`. Three-LED layouts keep the full default animations. Two-LED layouts use left/right movement and together-pulse patterns. One-LED layouts use distinct rhythms so `working`, `blocked`, `success`, and `error` remain recognizable.

Animations are executed as selected by the visual profile. The renderer maps LED selectors to the configured LEDs, scales timing by the selected speed, and skips redundant consecutive physical writes.

### 2. Install The Agent Hook

Install only the hook for the agent you actually use:

```powershell
# Install Codex hook handlers.
lumos hook install codex

# Install Claude Code hook handlers.
lumos hook install claude-code
```

After installing, run:

```powershell
lumos hook check
```

If the check reports that the `lumos` command is missing, confirm that `npm install -g agentlumos` has run and reopen PowerShell.

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

## Verification and Troubleshooting

These commands are mainly for checking effects or diagnosing problems. They are not the normal daily entry point for using AgentLumos:

```powershell
# Preview built-in animations to check whether LEDs are controllable.
lumos show

# Manually show short states to check animation behavior.
lumos show working
lumos show blocked
lumos show success
lumos show error

# Test one LED directly.
lumos led test caps

# Stop the current animation and restore the original Lock state.
lumos off

# Restart the background daemon.
lumos daemon restart

# Delete config and regenerate defaults on the next launch.
lumos config reset
```

## CLI

Run `lumos help` to see commands, arguments, and options. The CLI supports preview, state, diagnostic, daemon, config, and hook commands. Command mistakes print concise messages without JavaScript stack traces.

See the [CLI reference](docs/cli.md) for command details, exit codes, and platform behavior.

## Configuration

On Windows, AgentLumos stores config at:

```text
%APPDATA%\AgentLumos\config.json
```

Important fields:

| Field | Meaning |
| --- | --- |
| `leds` | Physical Lock LED order from left to right. |
| `states` | TTL for each state. |
| `visualProfiles` | Animation and speed for each state or state kind and LED layout. |
| `animations` | Reusable LED animation definitions. |
| `hookIntegrations` | Agent hook event to AgentLumos state mappings. |

In `lumos status`, `effectSuppressed` means the logical state is still working, but LED animation is temporarily quiet because keyboard or mouse-button activity was detected. `pendingReminder` means the latest finite `blocked`, `success`, or `error` state expired while quiet and is waiting to replay once input becomes idle. Mouse movement and wheel scrolling are not used for suppression.

Lease behavior:

- `working` renews on every matching hook and never replays after expiry.
- `blocked`, `success`, and `error` keep their latest lease while quiet, and the newest expired one may replay once after input becomes idle.
- Deferred replay lasts at least 5s for `blocked`, 3s for `success`, and 5s for `error`.
- Deferred reminders older than 5 minutes are discarded.
- `lumos off` clears both visible and pending state.

Use `lumos config reset` to reset the current config and let AgentLumos regenerate the default config on the next launch.

## Platform and Hardware Support

AgentLumos is currently Windows-first. The current driver targets keyboard Lock LEDs through Windows input behavior.

Linux and macOS hardware drivers are not implemented yet. Some keyboards, laptop firmware, KVMs, remote desktops, and vendor utilities may expose Lock state differently or not expose visible Lock LEDs at all.

## Documentation

- [Chinese README](README.zh-CN.md)
- [Chinese docs](docs/zh-CN/)
- [CLI reference](docs/cli.md)
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
