# AgentLumos

[English](README.md) | 简体中文

> 面向 AI 编码代理的运行状态提示工具。

[![npm](https://img.shields.io/npm/v/agentlumos.svg)](https://www.npmjs.com/package/agentlumos)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4.svg)](#平台与硬件支持)

AgentLumos 是面向 AI 编码代理的运行状态提示工具。初始功能通过物理键盘上的 Caps Lock、Num Lock 和 Scroll Lock 指示灯展示 Codex、Claude Code 这类工具的运行状态。

它不会包装你的 agent，不替换终端，也不增加屏幕悬浮层。它监听原生 hook 事件，然后播放短 LED 动画，让你用余光就能判断 agent 是正在工作、等待输入、已经完成，还是执行失败。

```text
active   [●○○] [○●○] [○○●]   agent 正在工作
blocked  [●●○] [○●●] [●○●]   等待输入或权限
success  [○●○] [●●●] [○●○]   任务完成
error    [●●●] [○○○] [●●●]   任务失败
```

## 为什么叫 Lumos？

“Lumos” 的含义是把原本不可见的后台工作照亮。AgentLumos 通过键盘上已有的 Lock 指示灯，让 AI agent 的运行状态变得可见。

## 亮点

- **环境反馈**：不用一直盯着终端，也能看到 agent 状态。
- **Hook 驱动**：把 Codex 和 Claude Code 的 hook 事件映射到 LED 状态。
- **初始方案不需要额外硬件**：复用许多键盘自带的 Lock 指示灯。
- **自动恢复状态**：执行动画前记录原始 Lock 状态，动画结束后恢复。
- **操作时临时静音**：你开始打字或点击/拖拽鼠标时，LED 动画会暂时静音并恢复原始 Lock 状态；停止操作几秒后，如果 agent 状态仍有效，动画会继续。
- **状态租约**：`active` 默认拥有 10 分钟租约，并会在新 hook 到来时续租；`blocked`、`success`、`error` 的默认 TTL 分别是 60 秒、10 秒和 20 秒，避免旧状态长时间残留。
- **可配置**：可以配置 LED 顺序、状态 TTL、visual profile、动画和 hook 映射。
- **Windows 原生**：使用当前 Windows 键盘 Lock 行为。

## 安装

克隆仓库并安装 CLI：

```powershell
# 安装依赖。
npm install

# 构建 CLI。
npm run build

# 全局注册本地 lumos 命令。
npm install -g .
```

需要 Node.js 20 或更高版本。

## 快速开始

在 PowerShell 里运行：

```powershell
# 查看 daemon 状态和当前 LED 状态。
lumos status

# 预览内置动画。
lumos show

# 显式预览全部状态灯效，也可以临时指定 layout。
lumos show demo
lumos show demo --leds c

# 设置物理 LED 从左到右的顺序。
lumos config set leds n,c,s

# 根据你使用的 agent 安装对应 hook。
lumos hook install codex
lumos hook install claude-code

# 检查 AgentLumos 和 agent hooks 是否就绪。
lumos hook check
```

## 基础使用

通常只需要先配置键盘上可见的 Lock 指示灯，再安装对应 agent 的 hook。之后 Codex 或 Claude Code 运行时会通过 hooks 自动触发 `active`、`blocked`、`success`、`error` 等状态，不需要日常手动执行状态命令。

状态命令使用已配置的 LED 顺序。如需不修改配置临时预览不同 layout，使用 `lumos show --leds ...`。

### 1. 配置你的键盘灯

先运行 `lumos show` 看哪些灯会动，再用 `lumos config set leds ...` 设置物理 LED 从左到右的顺序。

如果你的键盘只有一两个可见的 Lock 灯，只配置可用的灯：

```powershell
# 只使用 Caps Lock 指示灯。
lumos config set leds c

# 使用 Caps Lock 和 Num Lock 指示灯。
lumos config set leds c,n

# 常见三灯键盘：按实际从左到右顺序填写。
lumos config set leds n,c,s
```

LED CLI 输入既支持完整名称（`caps`、`num`、`scroll`），也支持简写（`c`、`n`、`s`）。保存到配置时会规范化为完整名称。

AgentLumos 通过 visual profile 为一灯、两灯、三灯布局显式选择动画和速度。三灯布局保持完整默认动画；两灯布局使用左右移动和双灯脉冲；一灯布局使用不同节奏，让 `active`、`blocked`、`success` 和 `error` 仍然容易区分。

动画会按 visual profile 的选择执行。renderer 负责把 LED selector 映射到已配置 LED，按 speed 缩放时间，并跳过连续重复的物理写入。

### 2. 安装对应 agent hook

只安装你实际使用的 agent：

```powershell
# 安装 Codex hook handlers。
lumos hook install codex

# 安装 Claude Code hook handlers。
lumos hook install claude-code
```

安装后运行：

```powershell
lumos hook check
```

如果检查结果提示缺少 `lumos` 命令，先确认已经执行过 `npm install -g .`，并重新打开 PowerShell。

## Agent hooks

AgentLumos 可以为支持的 agent 工具安装托管 hook 处理器。

```powershell
# 检查 AgentLumos hooks 是否就绪。
lumos hook check

# 安装 Codex hook handlers。
lumos hook install codex

# 安装 Claude Code hook handlers。
lumos hook install claude-code
```

默认映射：

| 工具 | 事件 |
| --- | --- |
| Codex | `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PermissionRequest`、`Stop` |
| Claude Code | `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUseFailure`、`PermissionRequest`、`Notification`、`Stop`、`StopFailure`、`SessionEnd` |

阅读安装说明：

- [Codex hooks 中文版](docs/zh-CN/hooks/codex.md)
- [Claude Code hooks 中文版](docs/zh-CN/hooks/claude-code.md)

## 验证和排障

这些命令主要用于确认效果或排查问题，不是日常使用 AgentLumos 的主入口：

```powershell
# 预览内置动画，检查 LED 是否可控。
lumos show

# 手动显示一个短状态，确认状态动画是否符合预期。
lumos show active
lumos show blocked
lumos show success
lumos show error

# 单独测试一个 LED。
lumos led test caps

# 停止当前动画并恢复原始 Lock 状态。
lumos off

# 重启后台 daemon。
lumos daemon restart

# 删除配置并在下次启动时重新生成默认配置。
lumos config reset
```

## CLI

运行 `lumos help` 查看命令、参数和选项。CLI 支持预览、状态、诊断、daemon、配置和 hook 命令。命令错误会输出简洁信息，不打印 JavaScript stack trace。

命令细节、退出码和平台行为请看 [CLI 参考](docs/zh-CN/cli.md)。

## 配置

在 Windows 上，AgentLumos 的配置文件位于：

```text
%APPDATA%\AgentLumos\config.json
```

重要字段：

| 字段 | 含义 |
| --- | --- |
| `leds` | 物理 Lock 灯从左到右的顺序。 |
| `states` | 每个状态对应的 TTL。 |
| `visualProfiles` | 每个状态和 LED layout 对应的动画与速度。 |
| `animations` | 可复用的 LED 动画定义。 |
| `hookIntegrations` | Agent hook 事件到 AgentLumos 状态的映射。 |

`lumos status` 中的 `effectSuppressed` 表示当前逻辑状态仍然存在，但因为检测到键盘或鼠标按钮操作，LED 动画正在临时静音。`pendingReminder` 表示最新的有限期 `blocked`、`success` 或 `error` 状态在静音期间已经过期，正在等待输入空闲后重新显示。鼠标移动和滚轮暂不触发静音。

租约行为：

- `active` 会在每次匹配的 hook 到来时续租，过期后不会回放。
- `blocked`、`success` 和 `error` 在静音期间会保留最新状态，空闲后最多回放一次。
- 延后回放的最短显示时间分别是：`blocked` 5 秒、`success` 3 秒、`error` 5 秒。
- 延迟超过 5 分钟的待回放提醒会被丢弃。
- `lumos off` 会清除当前可见状态和待回放状态。

使用 `lumos config reset` 可以重置当前配置，并让 AgentLumos 在下次启动时重新生成默认配置。

## 平台与硬件支持

AgentLumos 当前优先支持 Windows。当前驱动通过 Windows 输入行为控制键盘 Lock 指示灯。

Linux 和 macOS 硬件驱动暂未实现。部分键盘、笔记本固件、KVM、远程桌面或厂商工具可能会用不同方式暴露 Lock 状态，也可能没有可见的 Lock 指示灯。

## 文档

- [English README](README.md)
- [中文文档目录](docs/zh-CN/)
- [CLI 参考](docs/zh-CN/cli.md)
- [Windows 手动测试指南中文版](docs/zh-CN/manual-windows-test.md)
- [Codex hooks 中文版](docs/zh-CN/hooks/codex.md)
- [Claude Code hooks 中文版](docs/zh-CN/hooks/claude-code.md)

## 开发

```powershell
# 安装依赖。
npm install

# 运行测试。
npm test

# 构建 TypeScript 输出。
npm run build

# 全局注册本地 lumos 命令。
npm install -g .
```

## 贡献

欢迎提交 issue、bug 报告、键盘兼容性记录和 hook 映射改进。

请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解公开仓库的贡献流程。

## 许可

Apache-2.0。详见 [LICENSE](LICENSE)。
