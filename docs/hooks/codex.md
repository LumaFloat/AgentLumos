# Codex Hook Integration

AgentLumos does not wrap or replace the `codex` command. Codex keeps its normal launch flow, and native Codex hooks call `lumos` state commands.

## Default Mapping

```text
SessionStart      -> lumos active
UserPromptSubmit  -> lumos active
PreToolUse        -> lumos active
PostToolUse       -> lumos active
PermissionRequest -> lumos blocked
Stop              -> lumos success
```

Codex does not expose a confirmed stable generic reasoning hook for this use case, so AgentLumos does not define a separate reasoning state.

Codex also does not have a confirmed stable `SessionEnd` cleanup hook in the default mapping. `success` uses its configured TTL and then AgentLumos restores the original Lock state and returns to `idle`.

## Install Hooks

```powershell
# Install AgentLumos-managed Codex hook handlers.
lumos hook install codex
```

This writes AgentLumos-managed handlers to `C:\Users\<you>\.codex\hooks.json`. Existing non-AgentLumos hooks are preserved.

After installing, restart Codex. Codex may ask you to review and trust the hooks with `/hooks`.

To remove only AgentLumos-managed handlers:

```powershell
# Remove only AgentLumos-managed Codex hook handlers.
lumos hook uninstall codex
```

## Check Local Readiness

```powershell
# Print the human-readable readiness report.
lumos hook check

# Print the same readiness report as JSON.
lumos hook check --json
```

The check command reports AgentLumos hook readiness in a human-readable format by default. Use `--json` for the same structured report in scripts. It does not install hooks.
