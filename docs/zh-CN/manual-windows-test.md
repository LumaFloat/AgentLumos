# Windows 手动测试指南

本文用于在 Windows 本机上手动验证 AgentLumos 的基础功能和键盘 Lock LED 行为。

## 1. 准备

- 先确认你在仓库目录中。
- 确认键盘有可用的 Caps Lock、Num Lock、Scroll Lock 指示灯。
- 如果只有 1 个或 2 个灯可用，后面把 `leds` 只配置成可用的灯。

## 2. 安装与构建

```powershell
# 安装依赖。
npm install

# 运行测试。
npm test

# 构建 CLI。
npm run build

# 全局注册本地 lumos 命令。
npm install -g .
```

## 3. 基础命令

```powershell
# 查看 daemon 状态和当前 LED 状态。
lumos status

# 查看当前配置。
lumos config get

# 删除配置文件，让下次启动重新生成默认配置。
lumos config clean

# 预览内置动画，确认键盘灯是否响应。
lumos show
```

重点观察：

- `lumos status` 是否稳定返回当前状态对象。
- `lumos show` 是否能驱动键盘指示灯变化。
- `lumos config clean` 是否删除旧配置并让下次启动回到默认值。

## 4. 租约与静音测试

```powershell
# 设置一个较长的 active 租约。
lumos set active --ttl 10m

# 设置短 TTL 的状态。
lumos set blocked --ttl 5s
lumos set success --ttl 5s
lumos set error --ttl 5s

# 清除当前状态和任何待回放提醒。
lumos off
```

重点观察：

- `active` 在对应 hook 再次到来时会续租，过期后不会再回放。
- `blocked`、`success`、`error` 如果在你输入时过期，等输入空闲后最多会回放一次。
- `lumos off` 会同时清除可见状态和待回放状态。

## 5. 手动状态测试

先配置可用灯的顺序：

```powershell
# 按实体键盘从左到右设置可用 LED 顺序。
lumos config set leds caps,num,scroll
```

如果你的键盘不是这三个灯都可用，就改成只包含可用灯，例如：

```powershell
# 只使用 Caps Lock 指示灯。
lumos config set leds caps

# 使用 Caps Lock 和 Num Lock 指示灯。
lumos config set leds caps,num
```

然后依次执行：

```powershell
# 预览 active 动画。
lumos show active

# 预览 blocked 动画。
lumos show blocked

# 预览 success 动画。
lumos show success

# 预览 error 动画。
lumos show error

# 停止动画并恢复原始 Lock 状态。
lumos off
```

观察：

- `active` 是否是持续的工作态动画。
- `blocked` 是否是等待输入的提示态动画。
- `success` 是否是明显但短促的完成提示。
- `error` 是否是更醒目的失败提示。
- `off` 是否恢复到原始 Lock 状态。

## 6. 少灯布局测试

在 Windows 实体键盘上运行每种布局，并确认 `lumos off` 和 TTL 结束后会恢复原始 Lock 状态。

### 一颗可见灯

```powershell
lumos config set leds caps
lumos show active
lumos show blocked
lumos show success
lumos show error
lumos off
```

预期：

- `active`：一次短闪，然后长暂停。
- `blocked`：两次短闪。
- `success`：一次较长确认闪烁。
- `error`：三次快速闪烁。

### 两颗可见灯

```powershell
lumos config set leds caps,num
lumos show active
lumos show blocked
lumos show success
lumos show error
lumos off
```

预期：

- `active`：左灯再右灯的移动效果。
- `blocked`：两次双灯短闪。
- `success`：一次较长双灯确认闪烁。
- `error`：三次快速双灯闪烁。

### 三颗可见灯

```powershell
lumos config set leds num,caps,scroll
lumos show active
lumos show blocked
lumos show success
lumos show error
lumos off
```

预期：行为和 v0.3 三灯默认动画一致。

## 7. Hook 测试

```powershell
# 检查 hook 接入状态。
lumos hook check

# 以 JSON 输出 hook 接入状态。
lumos hook check --json

# 安装 Codex hook handlers。
lumos hook install codex

# 卸载 Codex hook handlers。
lumos hook uninstall codex

# 安装 Claude Code hook handlers。
lumos hook install claude-code

# 卸载 Claude Code hook handlers。
lumos hook uninstall claude-code
```

重点观察：

- `hook check` 是否区分已安装和未安装的目标。
- `hook install` 是否写入目标工具的 hook 配置。
- `hook uninstall` 是否移除 AgentLumos 管理的 hook 配置。

## 8. 常见问题

- 如果动画亮了但键盘灯没有变化，先确认是否是笔记本内置键盘、外接键盘，或者驱动不支持该灯。
- 如果某个灯顺序不对，先修正 `lumos config set leds ...`。
- 如果执行后无法恢复，先运行 `lumos off` 再看 `lumos status`。
