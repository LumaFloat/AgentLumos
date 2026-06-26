# AgentLumos CLI Reference

## Help

Use `lumos help`, `lumos --help`, or `lumos -h` to print the available commands and options.

## Commands

| Command | Purpose |
| --- | --- |
| `lumos help` | Show commands, arguments, and options. |
| `lumos status` | Show daemon state, selected LEDs, current animation, TTL, driver, and last error. |
| `lumos show` | Preview the built-in LED sequence. |
| `lumos show <state>` | Preview one state effect. `<state>` is `active`, `blocked`, `success`, or `error`. |
| `lumos set <state> [--ttl <duration>] [--leds <list>] [--animation <name>]` | Set the current agent state for hooks or scripts. `<state>` is `active`, `blocked`, `success`, or `error`. |
| `lumos off` | Stop the animation and restore the original Lock state. |
| `lumos poke <led>` | Toggle one LED for diagnostics. |
| `lumos test <led>` | Toggle one LED for diagnostics. |
| `lumos daemon stop` | Stop the background daemon. |
| `lumos daemon restart` | Restart the background daemon. |
| `lumos config get` | Print the current config. |
| `lumos config set <key> <value>` | Update config. Currently supports `leds` and `defaultTtl`. |
| `lumos config clean` | Delete the config file so defaults are regenerated next time. |
| `lumos hook get` | Print the current hook mapping config. |
| `lumos hook check` | Print a human-readable hook readiness report. |
| `lumos hook check --json` | Print hook readiness as structured JSON. |
| `lumos hook install codex` | Install AgentLumos-managed Codex hook handlers. |
| `lumos hook install claude-code` | Install AgentLumos-managed Claude Code hook handlers. |
| `lumos hook uninstall codex` | Remove AgentLumos-managed Codex hook handlers. |
| `lumos hook uninstall claude-code` | Remove AgentLumos-managed Claude Code hook handlers. |

## Arguments

`lumos set` supports these options:

| Option | Meaning |
| --- | --- |
| `--ttl <duration>` | State lifetime for this command. Supports `5`, `5s`, `30m`, `2h`; a value without a unit means seconds. State commands also support `0`. |
| `--leds <list>` | LED list for this command, for example `caps`, `caps,num`, or `num,caps,scroll`. |
| `--animation <name>` | Animation name for this command. Names must start with a lowercase letter and may contain lowercase letters, numbers, and hyphens. |

`<led>` must be `caps`, `num`, or `scroll`.

## Config Keys

`lumos config set` currently supports:

| Key | Example | Purpose |
| --- | --- | --- |
| `leds` | `lumos config set leds caps,num` | Set the physical Lock LED order from left to right. |
| `defaultTtl` | `lumos config set defaultTtl 30m` | Set the default TTL string. |

## Examples

```powershell
# Set LED order to match your keyboard.
lumos config set leds num,caps,scroll

# Install only the hook for the agent you use.
lumos hook install codex
lumos hook install claude-code

# Check whether hooks are ready.
lumos hook check

# Show status and config.
lumos status
lumos config get

# Troubleshoot whether the Caps Lock LED is controllable.
lumos test caps

# Preview the blocked effect.
lumos show blocked

# Set blocked state from a custom hook for 10 seconds.
lumos set blocked --ttl 10s
```

## Errors and Exit Codes

Expected command mistakes print a concise message without a JavaScript stack trace.

- `0`: success.
- `1`: unexpected or unclassified internal failure.
- `2`: invalid command, invalid argument, or invalid config value.
- `3`: unsupported platform for physical LED control.
- `4`: daemon or IPC unavailable.
- `5`: Windows keyboard driver failure.

## Platform Behavior

AgentLumos currently supports physical keyboard LED effects on Windows.

Linux and macOS hardware drivers are not implemented yet. Physical LED commands on non-Windows platforms exit with a clear unsupported-platform message instead of silently using a fake keyboard backend.
