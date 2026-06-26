# AgentLumos Windows Manual Test

Use this checklist on a real Windows machine before calling v0.2.1 ready.

## Prerequisites

- A Windows machine with a keyboard that exposes at least one Lock indicator LED.
- `agentlumos` installed globally.
- A shell that can run `lumos`.

## 1. Install and build

```powershell
# Install dependencies.
npm install

# Run tests.
npm test

# Build the CLI.
npm run build

# Register the local lumos command globally.
npm install -g .
```

## 2. Basic commands

```powershell
# Show daemon status and current LED state.
lumos status

# Print the current config.
lumos config get

# Delete the config file so defaults are regenerated next time.
lumos config clean

# Preview built-in animations to verify LED control.
lumos show
```

Confirm:

- `lumos status` returns a stable, readable status object.
- `lumos show` visibly changes at least one configured keyboard Lock LED.
- `lumos config clean` removes old config so defaults can regenerate.

## 3. Manual state test

Configure the LEDs in physical left-to-right order:

```powershell
# Set all three Lock LEDs in physical order.
lumos config set leds caps,num,scroll
```

If your keyboard exposes fewer LEDs, configure only the LEDs you can see:

```powershell
# Use only the Caps Lock LED.
lumos config set leds caps

# Use Caps Lock and Num Lock LEDs.
lumos config set leds caps,num
```

Run each preview command:

```powershell
# Preview the active animation.
lumos show active

# Preview the blocked animation.
lumos show blocked

# Preview the success animation.
lumos show success

# Preview the error animation.
lumos show error

# Stop animation and restore the original Lock state.
lumos off
```

Confirm:

- `active` shows the working-state animation.
- `blocked` shows the waiting-for-input animation.
- `success` shows a visible completion animation.
- `error` shows a more prominent failure animation.
- `off` restores the original Lock state.

## 4. Lease and suppression test

```powershell
# Set a long-lived active lease.
lumos set active --ttl 10m

# Set short-lived notification states.
lumos set blocked --ttl 5s
lumos set success --ttl 5s
lumos set error --ttl 5s

# Clear the current state and any pending reminder.
lumos off
```

Confirm:

- `active` renews when the matching hook fires again and does not replay after expiry.
- `blocked`, `success`, and `error` can replay once after the keyboard becomes idle if they expired while you were typing.
- `lumos off` clears both the visible state and any pending reminder.

## 5. Direct LED poke test

```powershell
# Toggle Caps Lock once, like a manual key press.
lumos poke caps

# Toggle Num Lock once, if the keyboard exposes it.
lumos poke num

# Toggle Scroll Lock once, if the keyboard exposes it.
lumos poke scroll
```

Confirm each available Lock LED toggles directly.

## 6. Daemon test

```powershell
# Stop the background daemon.
lumos daemon stop

# Stop and relaunch the background daemon.
lumos daemon restart
```

Confirm the daemon stops and comes back cleanly.

## 7. Hook test

```powershell
# Print hook integration config.
lumos hook get

# Check hook readiness.
lumos hook check

# Install Codex hook handlers.
lumos hook install codex

# Remove Codex hook handlers.
lumos hook uninstall codex

# Install Claude Code hook handlers.
lumos hook install claude-code

# Remove Claude Code hook handlers.
lumos hook uninstall claude-code
```

Confirm:

- `hook get` prints the hook integration config.
- `hook check` reports command availability and daemon status.
- `hook install` reports installed handlers and the target config path.
- `hook uninstall` reports removed handlers.

## 8. Final status

```powershell
# Print the final daemon status.
lumos status
```

Confirm the status object is stable and readable.

## Notes

- If your keyboard has fewer than three usable LEDs, use `lumos config set leds ...` to declare only the LEDs that visibly respond, in physical left-to-right order.
- `lumos show` is the fastest way to learn which Lock indicators your keyboard actually exposes.
- The project does not promise recovery from process kill, OS crash, or power loss.
