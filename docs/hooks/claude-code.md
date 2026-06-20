# Claude Code Hook Integration

AgentLumos does not wrap or replace the `claude` command. Claude Code keeps its normal launch flow, and native Claude Code hooks call `lumos` state commands.

## Default Mapping

```text
SessionStart       -> lumos active
UserPromptSubmit   -> lumos active
PreToolUse         -> lumos active
PostToolUseFailure -> lumos error
PermissionRequest  -> lumos blocked
Notification       -> lumos blocked
Stop               -> lumos success
StopFailure        -> lumos error
SessionEnd         -> lumos off
```

Claude Code has more lifecycle events than the default Codex mapping, including `SessionEnd`, so it can restore AgentLumos on session exit when that hook is available.

AgentLumos does not define a separate reasoning state because Claude Code does not expose a stable generic reasoning hook that maps cleanly across agent behavior.

## Install Hooks

```powershell
# Install AgentLumos-managed Claude Code hook handlers.
lumos hook install claude-code
```

This writes AgentLumos-managed handlers to `C:\Users\<you>\.claude\settings.json`. Existing non-AgentLumos hooks are preserved.

To remove only AgentLumos-managed handlers:

```powershell
# Remove only AgentLumos-managed Claude Code hook handlers.
lumos hook uninstall claude-code
```

## Check Local Readiness

```powershell
# Print the human-readable readiness report.
lumos hook check

# Print the same readiness report as JSON.
lumos hook check --json
```

The check command reports AgentLumos hook readiness in a human-readable format by default. Use `--json` for the same structured report in scripts. It does not install hooks.
