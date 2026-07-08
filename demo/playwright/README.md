# Playwright 截图工具

基于 [Playwright](https://playwright.dev/) 的网页截图命令行工具，使用 TypeScript + pnpm 编写。支持全页截图、自定义视口、等待策略等。

## 环境要求

- Node.js >= 18
- pnpm >= 9

## 初始化

```bash
cd demo/playwright
pnpm install
# 首次使用需下载 chromium 浏览器内核
pnpm exec playwright install chromium
```

## 配置

复制 `.env.example` 为 `.env` 可设置默认值（命令行参数优先级更高）：

```bash
cp .env.example .env
```

可用变量见 `.env.example`。

## 使用

```bash
# 默认截 .env 中的 SCREENSHOT_URL，输出到 screenshots/
pnpm shot

# 指定 URL 与输出路径
pnpm shot --url https://example.com --output out/home.png

# 全页截图 + 自定义视口
pnpm shot --url https://example.com --full --width 1440 --height 900

# 指定等待策略与超时
pnpm shot --url https://example.com --wait-until networkidle --timeout 60000

# 手机 H5 活动页：移动端视口 + 全页（自动滚动触发懒加载）
pnpm shot --url https://xxx/page/xxx --mobile --full

# 携带自定义 UA 与 Cookies（如需要登录态的页面）
pnpm shot --url https://xxx --user-agent "Mozilla/5.0 ..." --cookies "session=abc123; uid=888"
pnpm shot --url https://xxx --cookies '[{"name":"session","value":"abc","domain":".example.com","path":"/"}]'
```

### 命令行参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--url <url>` | 目标地址 | 读取 `.env` 的 `SCREENSHOT_URL` |
| `-o, --output <path>` | 输出文件路径 | `screenshots/<域名>.png` |
| `--full` | 截取完整页面（截图前会滚动触发懒加载） | 否 |
| `--mobile` | 移动端预设视口（390×844, DPR 2），适合手机 H5 活动页 | 否 |
| `--width <px>` | 视口宽度 | `1280` |
| `--height <px>` | 视口高度 | `800` |
| `--wait-until <mode>` | `load`/`domcontentloaded`/`networkidle`/`commit` | `networkidle` |
| `--timeout <ms>` | 超时时间 | `30000` |
| `--user-agent <ua>` | 自定义 User-Agent | 不设置 |
| `--cookies <str>` | Cookies：`name=value; name2=value2` 或 JSON 数组 | 不设置 |
| `-h, --help` | 显示帮助 | - |

### 自定义 UA / Cookies

默认**不设置** UA 和 Cookies（使用浏览器默认）。当目标页面需要登录态或特定设备标识时：

- `--user-agent` / `--ua`：直接传入 UA 字符串。
- `--cookies`：支持两种写法
  - 简单格式 `name1=value1; name2=value2`（domain 自动取目标 URL 主机名，path 为 `/`）
  - JSON 数组 `[{"name":"x","value":"y","domain":".example.com","path":"/"}]`（可精确控制 domain/path/expires 等）

等价配置也可写入 `.env`（`USER_AGENT` / `COOKIES`），命令行参数优先级更高。

### 常见坑：截图「只有一部分」

很多营销活动页是**手机 H5 页面**，存在两个特点：

1. **内容高度随视口宽度剧烈变化**：桌面宽度下只渲染压缩版，移动端宽度下才是完整内容。
   对此类页面请加 `--mobile` 用手机视口截图。
2. **图片/内容懒加载**：未滚动到的区域高度为 0，直接截会漏掉。
   开启 `--full` 后工具会先滚动到底部触发懒加载，再回到顶部截图，确保完整。

如果页面滚动发生在内部容器（而非 window），可改用 `--width/--height` 调整视口，或后续扩展 `--selector` 指定元素截图。

## 类型检查

```bash
pnpm typecheck
```

## 目录结构

```
demo/playwright/
├── package.json
├── tsconfig.json
├── .npmrc
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── config.ts      # 配置读取（env + 默认值）
    ├── screenshot.ts  # 核心：启动 chromium → 访问 → 截图
    └── index.ts       # CLI 入口：解析参数并调用截图
```
