# AgentLumos CLI 参考

## 帮助

使用 `lumos help`、`lumos --help` 或 `lumos -h` 查看可用命令和选项。

## 命令

| 命令 | 作用 |
| --- | --- |
| `lumos help` | 显示命令、参数和选项。 |
| `lumos status` | 查看 daemon 状态、已配置 LED、当前动画、TTL、驱动和最近错误。 |
| `lumos show [--leds <list>]` | 预览内置 LED 动画序列。等同于 `lumos show demo`。 |
| `lumos show demo [--leds <list>]` | 依次预览所有内置状态灯效。 |
| `lumos show <state> [-k <kind>] [--leds <list>]` | 预览一个状态或 state-kind 灯效。`<state>` 可选 `working`、`blocked`、`success`、`error`；也支持 `state.kind` 写法。 |
| `lumos set <state> [-k <kind>] [--ttl <duration>]` | 为 hook 或脚本设置当前 agent 状态。`<state>` 可选 `working`、`blocked`、`success`、`error`。 |
| `lumos off` | 停止动画并恢复原始 Lock 状态。 |
| `lumos led test <led>` | 切换一个 LED，用于诊断。 |
| `lumos daemon stop` | 停止后台 daemon。 |
| `lumos daemon restart` | 重启后台 daemon。 |
| `lumos config get` | 查看当前配置。 |
| `lumos config set <key> <value>` | 更新配置。目前支持 `leds` 和 `defaultTtl`。 |
| `lumos config reset` | 重置配置，下次启动时重新生成默认配置。 |
| `lumos hook get` | 查看当前 hook 映射配置。 |
| `lumos hook check` | 输出面向人的 hook 就绪状态报告。 |
| `lumos hook check --json` | 以结构化 JSON 输出 hook 接入状态。 |
| `lumos hook install codex` | 安装 AgentLumos 管理的 Codex hook handlers。 |
| `lumos hook install claude-code` | 安装 AgentLumos 管理的 Claude Code hook handlers。 |
| `lumos hook uninstall codex` | 移除 AgentLumos 管理的 Codex hook handlers。 |
| `lumos hook uninstall claude-code` | 移除 AgentLumos 管理的 Claude Code hook handlers。 |

## 参数

`lumos show` 支持这些可选参数：

| 参数 | 说明 |
| --- | --- |
| `--leds <list>` | 本次预览临时覆盖 LED 列表，例如 `caps`、`caps,num`、`num,caps,scroll`。它不会修改已保存配置。 |
| `-k, --kind <kind>` | 预览某个 state-kind profile，例如 `lumos show working -k command`。 |

`lumos set` 支持这些可选参数：

| 参数 | 说明 |
| --- | --- |
| `-k, --kind <kind>` | 可选的状态细分类，例如 `command`、`tool`、`permission`、`turn` 或 `critical`。kind 必须适用于所选 state。 |
| `--ttl <duration>` | 本次状态的有效时间。支持 `5`、`5s`、`30m`、`2h`；没有单位时默认按秒处理。状态命令也支持 `0`。 |

`<led>` 可选值是 `caps`、`num`、`scroll`。CLI 输入也支持简写：`c` 表示 `caps`，`n` 表示 `num`，`s` 表示 `scroll`。配置值会规范化为完整 LED 名称。

## 配置键

`lumos config set` 目前支持：

| 键 | 示例 | 作用 |
| --- | --- | --- |
| `leds` | `lumos config set leds c,n` | 设置物理 Lock 灯从左到右的顺序。 |
| `defaultTtl` | `lumos config set defaultTtl 30m` | 设置默认 TTL 字符串。 |

## 示例

```powershell
# 按你的键盘实际灯位设置 LED 顺序。
lumos config set leds n,c,s

# 只安装你使用的 agent hook。
lumos hook install codex
lumos hook install claude-code

# 检查 hook 是否就绪。
lumos hook check

# 查看状态和配置。
lumos status
lumos config get

# 排障时检查 Caps Lock LED 是否可控。
lumos led test caps

# 预览 blocked 灯效。
lumos show blocked

# 预览 state-kind 灯效。
lumos show working.command
lumos show error -k critical

# 设置更细的状态 kind。
lumos set working -k command
lumos set blocked -k permission

# 不修改配置，临时按一灯 layout 预览全部效果。
lumos show demo --leds c

# 自定义 hook 中设置 10 秒 blocked 状态。
lumos set blocked --ttl 10s

```

## 错误与退出码

可预期的命令错误会输出简洁信息，不打印 JavaScript stack trace。

- `0`：成功。
- `1`：未预期或未分类的内部失败。
- `2`：无效命令、无效参数或无效配置值。
- `3`：当前平台不支持物理 LED 控制。
- `4`：daemon 或 IPC 不可用。
- `5`：键盘驱动错误。

## 平台行为

AgentLumos 当前支持 Windows 上的物理键盘 LED 效果。

Linux 和 macOS 硬件驱动暂未实现。在非 Windows 平台上运行物理 LED 命令会输出明确的不支持平台提示，而不是静默使用 fake keyboard backend。
