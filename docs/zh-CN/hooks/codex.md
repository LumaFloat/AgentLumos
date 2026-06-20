# Codex hooks

AgentLumos 不会包装或替换 `codex`。它只把 Codex 的原生 hooks 映射到 LED 状态。

## 默认映射

- `SessionStart` -> `lumos active`
- `UserPromptSubmit` -> `lumos active`
- `PreToolUse` -> `lumos active`
- `PostToolUse` -> `lumos active`
- `PermissionRequest` -> `lumos blocked`
- `Stop` -> `lumos success`

当前不提供“推理中”这类单独状态，因为 Codex 暴露的稳定 hook 里没有对应的通用事件。

## 安装

```powershell
# 安装 AgentLumos 管理的 Codex hook handlers。
lumos hook install codex
```

这会把 AgentLumos 管理的 Codex hook 配置写入 `%USERPROFILE%\.codex\hooks.json`。

如果 Codex 首次提示信任 hooks，选择信任后它们才会执行。

## 卸载

```powershell
# 只移除 AgentLumos 管理的 Codex hook handlers。
lumos hook uninstall codex
```

这会移除 AgentLumos 管理的 Codex hook 配置。

## 检查

```powershell
# 输出面向人的就绪状态报告。
lumos hook check

# 以 JSON 输出同一份就绪状态报告。
lumos hook check --json
```

`check` 会显示是否已安装、缺少哪些事件，以及 Codex hook 文件是否可写。
