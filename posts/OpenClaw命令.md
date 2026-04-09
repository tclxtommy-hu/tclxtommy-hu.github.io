﻿# OpenClaw 命令参考手册

> 版本：2026.2.26  
> 整理时间：2026-02-28 13:47

---

## 📚 目录

1. [核心命令](#1-核心命令)
2. [Gateway 管理](#2-gateway-管理)
3. [模型配置](#3-模型配置)
4. [渠道管理](#4-渠道管理)
5. [会话管理](#5-会话管理)
6. [技能管理](#6-技能管理)
7. [常用示例](#7-常用示例)

---

## 1. 核心命令

### 基础命令

| 命令 | 说明 |
|------|------|
| `openclaw --help` | 显示帮助信息 |
| `openclaw --version` | 显示版本号 |
| `openclaw status` | 显示渠道健康和最近会话 |
| `openclaw dashboard` | 打开控制 UI |
| `openclaw docs` | 搜索在线文档 |
| `openclaw help <command>` | 显示子命令帮助 |

### 配置命令

| 命令 | 说明 |
|------|------|
| `openclaw configure` | 交互式配置向导 |
| `openclaw configure --section <section>` | 配置指定部分 (workspace/model/web/gateway/channels/skills/health) |
| `openclaw config get <key>` | 获取配置值 |
| `openclaw config set <key> <value>` | 设置配置值 |
| `openclaw onboard` | 交互式入门向导 |
| `openclaw setup` | 初始化本地配置和工作区 |
| `openclaw reset` | 重置本地配置/状态（保留 CLI） |
| `openclaw uninstall` | 卸载 Gateway 服务 + 本地数据 |

### 全局选项

```bash
--dev                # 开发模式：隔离状态，默认端口 19001
--profile <name>     # 使用命名配置文件
--log-level <level>  # 日志级别 (silent|fatal|error|warn|info|debug|trace)
--no-color           # 禁用颜色输出
```

---

## 2. Gateway 管理

### 启动/停止

```bash
openclaw gateway run              # 前台运行 Gateway
openclaw gateway start            # 启动 Gateway 服务
openclaw gateway stop             # 停止 Gateway 服务
openclaw gateway restart          # 重启 Gateway 服务
openclaw gateway --port 18789     # 指定端口运行
openclaw gateway --force          # 强制重启（杀死现有监听）
openclaw gateway --dev            # 开发模式 Gateway
```

### 状态检查

```bash
openclaw gateway status           # 显示服务状态 + 可达性探测
openclaw gateway health           # 获取健康状态
openclaw gateway discover         # 发现本地/广域网 Gateway
openclaw gateway probe            # 显示可达性 + 发现 + 健康摘要
```

### 服务安装

```bash
openclaw gateway install          # 安装服务 (launchd/systemd/schtasks)
openclaw gateway uninstall        # 卸载服务
  
openclaw gateway install-service  # Windows服务运行 安装后可以通过Windows服务管理器控制，开机自启，完全后台运行。
```

### 高级选项

```bash
--bind <mode>          # 绑定模式 (loopback|lan|tailnet|auto|custom)
--auth <mode>          # 认证模式 (none|token|password|trusted-proxy)
--token <token>        # 共享令牌
--tailscale <mode>     # Tailscale 暴露模式 (off|serve|funnel)
--verbose              # 详细日志
--ws-log <style>       # WebSocket 日志样式 (auto|full|compact)
```

---

## 3. 模型配置

### 基本命令

```bash
openclaw models list              # 列出已配置的模型
openclaw models status            # 显示配置的模型状态
openclaw models set <model>       # 设置默认模型
openclaw models scan              # 扫描 OpenRouter 免费模型
```

### 模型管理

```bash
openclaw models aliases list      # 列出模型别名
openclaw models fallbacks list    # 列出回退模型列表
openclaw models set-image <model> # 设置图像模型
```

### 认证管理

```bash
openclaw models auth add          # 添加认证配置
openclaw models auth login --provider <id>  # 登录提供商
openclaw models auth setup-token  # 设置令牌
openclaw models auth paste-token  # 粘贴令牌
```

### 状态检查

```bash
openclaw models status --json     # JSON 输出
openclaw models status --plain    # 纯文本输出
openclaw models status --probe    # 实时探测认证
openclaw models status --agent <id>  # 检查指定代理
```

---

## 4. 渠道管理

### 渠道列表

```bash
openclaw channels list            # 列出配置的渠道 + 认证
openclaw channels status          # 显示渠道状态
openclaw channels status --probe  # 运行状态检查 + 探测
openclaw channels status --deep   # 深度检查
```

### 渠道操作

```bash
openclaw channels add --channel <channel> --token <token>  # 添加渠道
openclaw channels remove --channel <channel>               # 删除渠道
openclaw channels login --channel <channel>                # 登录渠道
openclaw channels logout --channel <channel>               # 登出渠道
openclaw channels resolve <name>                           # 解析名称到 ID
openclaw channels capabilities                               # 显示提供商能力
openclaw channels logs                                     # 显示最近日志
```

### 支持的渠道

- Telegram
- Discord
- WhatsApp
- Slack
- Feishu (飞书)
- Signal
- iMessage
- 等

---

## 5. 会话管理

### 会话列表

```bash
openclaw sessions                   # 列出所有会话
openclaw sessions --active 120      # 仅最近 120 分钟
openclaw sessions --agent <id>      # 指定代理的会话
openclaw sessions --all-agents      # 跨所有代理聚合
openclaw sessions --json            # JSON 输出
openclaw sessions --verbose         # 详细输出
```

### 会话维护

```bash
openclaw sessions cleanup           # 运行会话存储维护
```

### 会话信息

显示每个会话的 token 使用情况（如果代理报告）

---

## 6. 技能管理

```bash
openclaw skills list                # 列出所有可用技能
openclaw skills info <skill>        # 显示技能详细信息
openclaw skills check               # 检查技能就绪状态
```

---

## 7. 常用示例

### 日常操作

```bash
# 查看状态
openclaw status

# 查看当前模型
openclaw models status

# 切换模型
openclaw models set ollama/qwen2.5:7b

# 查看会话
openclaw sessions --active 60

# 查看技能
openclaw skills list
```

### Gateway 管理

```bash
# 重启 Gateway
openclaw gateway restart

# 查看 Gateway 状态
openclaw gateway status

# 查看日志
openclaw logs --follow
```

### 渠道管理

```bash
# 列出渠道
openclaw channels list

# 添加 Telegram 频道
openclaw channels add --channel telegram --token <token>

# 登录 WhatsApp
openclaw channels login --channel whatsapp
```

### 故障排查

```bash
# 健康检查
openclaw doctor

# 深度渠道检查
openclaw channels status --deep

# 查看日志
openclaw logs --follow

# 模型认证探测
openclaw models status --probe
```

### 开发模式

```bash
# 开发 Gateway
openclaw --dev gateway

# 开发模式重置
openclaw --dev gateway --reset

# 使用命名配置
openclaw --profile test gateway
```

---

## 🔗 相关资源

- 官方文档：https://docs.openclaw.ai
- CLI 文档：https://docs.openclaw.ai/cli
- GitHub: https://github.com/openclaw/openclaw
- 社区：https://discord.com/invite/clawd

---

*本手册由 OpenClaw 自动整理生成*
