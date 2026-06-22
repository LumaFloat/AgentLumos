# AgentLumos

> 面向 AI 编码代理的运行状态提示工具。

[![npm](https://img.shields.io/npm/v/agentlumos.svg)](https://www.npmjs.com/package/agentlumos)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4.svg)](#平台与硬件支持)

AgentLumos 是面向 AI 编码代理的运行状态提示工具。初始功能通过物理键盘上的 Caps Lock、Num Lock 和 Scroll Lock 指示灯展示 Codex、Claude Code 这类工具的运行状态。

它不会包装你的 agent，不替换终端，也不增加屏幕悬浮层。它监听原生 hook 事件，然后播放短 LED 动画，让你用余光就能判断 agent 是正在工作、等待输入、已经完成，还是执行失败。

```text
active   [1..] [..2] [3..]   agent 正在工作
blocked  [12.] [.23]         等待输入或权限
success  [1.3] [.2.]         任务完成
error    [123] [---]         任务失败
```

## 为什么叫 Lumos？

“Lumos” 的含义是把原本不可见的后台工作照亮。AgentLumos 通过键盘上已有的 Lock 指示灯，让 AI agent 的运行状态变得可见。

## 亮点

- **环境反馈**：不用一直盯着终端，也能看到 agent 状态。
- **Hook 驱动**：把 Codex 和 Claude Code 的 hook 事件映射到 LED 状态。
- **初始方案不需要额外硬件**：复用许多键盘自带的 Lock 指示灯。
- **自动恢复状态**：执行动画前记录原始 Lock 状态，动画结束后恢复。
- **操作时临时静音**：你开始打字或点击/拖拽鼠标时，LED 动画会暂时静音并恢复原始 Lock 状态；停止操作几秒后，如果 agent 状态仍有效，动画会继续。
- **可配置**：可以配置 LED 顺序、状态 TTL、动画和 hook 映射。
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

## 30 秒测试

在 PowerShell 里运行：

```powershell
# 查看 daemon 状态和当前 LED 状态。
lumos status

# 播放内置动画。
lumos demo

# 设置物理 LED 从左到右的顺序。
lumos config set leds num,caps,scroll

# 显示 5 秒 active 动画。
lumos active --ttl 5

# 显示 5 秒 blocked 动画。
lumos blocked --ttl 5

# 显示 success 动画。
lumos success

# 显示 error 动画。
lumos error

# 停止动画并恢复原始 Lock 状态。
lumos off
```

如果你的键盘只有一两个可见的 Lock 灯，只配置可用的灯：

```powershell
# 只使用 Caps Lock 指示灯。
lumos config set leds caps

# 使用 Caps Lock 和 Num Lock 指示灯。
lumos config set leds caps,num
```

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

## CLI

| 命令 | 作用 |
| --- | --- |
| `lumos status` | 查看 daemon 状态、已配置 LED、当前动画、TTL、驱动和最近错误。 |
| `lumos demo` | 播放内置演示动画。 |
| `lumos active` | 显示 agent 工作中状态。 |
| `lumos blocked` | 显示等待用户输入状态。 |
| `lumos success` | 显示完成状态。 |
| `lumos error` | 显示失败状态。 |
| `lumos off` | 停止动画并恢复原始 Lock 状态。 |
| `lumos config get` | 查看当前配置。 |
| `lumos config clean` | 删除配置文件，下次启动时重新生成默认配置。 |
| `lumos hook check --json` | 以结构化 JSON 输出 hook 接入状态。 |

## 配置

在 Windows 上，AgentLumos 的配置文件位于：

```text
%APPDATA%\AgentLumos\config.json
```

重要字段：

| 字段 | 含义 |
| --- | --- |
| `leds` | 物理 Lock 灯从左到右的顺序。 |
| `states` | 每个状态对应的动画和 TTL。 |
| `animations` | 可复用的 LED 动画定义。 |
| `hookIntegrations` | Agent hook 事件到 AgentLumos 状态的映射。 |

`lumos status` 中的 `effectSuppressed` 表示当前逻辑状态仍然存在，但因为检测到键盘或鼠标按钮操作，LED 动画正在临时静音。鼠标移动和滚轮暂不触发静音。

使用 `lumos config clean` 可以删除当前配置，并让 AgentLumos 在下次启动时重新生成默认配置。

## 平台与硬件支持

AgentLumos 当前优先支持 Windows。当前驱动通过 Windows 输入行为控制键盘 Lock 指示灯。

Linux 和 macOS 暂未实现。部分键盘、笔记本固件、KVM、远程桌面或厂商工具可能会用不同方式暴露 Lock 状态，也可能没有可见的 Lock 指示灯。

更长期的方向是通过一眼可见的硬件指示方式展示 agent 状态。后续可能探索键盘背光或 RGB 背光区域、专用外部状态灯硬件、跨平台驱动、更强的异常中断恢复、更完整的键盘兼容性记录和更多集成。

## 文档

- [English README](README.md)
- [中文文档目录](docs/zh-CN/)
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
