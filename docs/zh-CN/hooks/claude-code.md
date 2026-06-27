# Claude Code hooks

AgentLumos 使用 Claude Code 的原生 hooks 驱动 LED 状态，不替换 Claude Code 本身。

## 默认映射

- `SessionStart` -> `lumos set working -k preparing`
- `UserPromptSubmit` -> `lumos set working -k preparing`
- `PreToolUse` -> `lumos set working -k tool`
- `PostToolUseFailure` -> `lumos set error -k tool`
- `PermissionRequest` -> `lumos set blocked -k permission`
- `Notification` -> `lumos set blocked -k input`
- `Stop` -> `lumos set success -k turn`
- `StopFailure` -> `lumos set error -k critical`
- `SessionEnd` -> `lumos off`

## 安装

```powershell
# 安装 AgentLumos 管理的 Claude Code hook handlers。
lumos hook install claude-code
```

这会把 AgentLumos 管理的 Claude Code hook 配置写入 `%USERPROFILE%\.claude\settings.json`。

如果 Claude Code 首次提示信任 hooks，选择信任后它们才会执行。

## 卸载

```powershell
# 只移除 AgentLumos 管理的 Claude Code hook handlers。
lumos hook uninstall claude-code
```

这会移除 AgentLumos 管理的 Claude Code hook 配置。

## 检查

```powershell
# 输出面向人的就绪状态报告。
lumos hook check

# 以 JSON 输出同一份就绪状态报告。
lumos hook check --json
```

`check` 会显示是否已安装、缺少哪些事件，以及 Claude Code 配置是否可写。
