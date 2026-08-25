# JSONL + zstd Demo

基于 **Node.js + TypeScript + pnpm** 的 JSONL + zstd 日志压缩/解压/流式处理示例，对应文章 [`posts/AI/AI实践/日志处理-JSONL-zstd.md`](../../posts/AI/AI实践/日志处理-JSONL-zstd.md)。

## 特性

- **三种压缩方案对照**：
  - `@bokuweb/zstd-wasm` — 纯 WASM 实现，**无需原生编译、无需系统安装 zstd**，跨平台开箱即用
  - `simple-zstd` — 封装系统 zstd 命令行，支持**真流式**压缩/解压
  - `lz-string` — 纯 JS 浏览器端轻量压缩，用于对比
- 缓冲模式：compress / decompress / filterRead（`@bokuweb/zstd-wasm`）
- 流式模式：streamWrite / streamRead（`simple-zstd`，需系统 zstd）
- zstd 魔数检测（`0x28B52FFD`）
- 压缩率统计与体积对比
- 代码风格与 `demo/BM25` 对齐：`type: module` + `tsc` 编译 + ESM `.js` 后缀导入

## 快速开始

```bash
cd demo/jsonl-zstd

# 安装依赖（使用淘宝 npm 镜像，见 .npmrc）
pnpm install

# 运行全部演示
pnpm demo

# 或分步运行
pnpm compress     # 压缩 JSONL → .jsonl.zst
pnpm decompress   # 解压并过滤读取
pnpm stream       # 流式压缩/读取（需系统 zstd）
pnpm lz           # lz-string vs zstd 对比
```

## 依赖说明

| 包 | 用途 | 备注 |
|----|------|------|
| `@bokuweb/zstd-wasm` | 缓冲压缩/解压 | 纯 WASM，Windows/macOS/Linux **开箱即用，无需原生编译** |
| `simple-zstd` | 流式压缩/解压 | 封装系统 zstd 二进制，需 `zstd` 在 PATH 中 |
| `lz-string` | 浏览器端轻量压缩 | 纯 JS，用于对比演示 |

### 系统安装 zstd（仅流式演示需要）

```bash
# Windows
choco install zstd
# 或
scoop install zstd

# macOS
brew install zstd

# Ubuntu / Debian
sudo apt install zstd
```

> 未安装 zstd 时，`pnpm compress` / `pnpm decompress` / `pnpm lz` 仍可正常运行（使用 `@bokuweb/zstd-wasm` 纯 WASM），仅 `pnpm stream` 会跳过。

## 目录结构

```
demo/jsonl-zstd/
├── .npmrc              # 淘宝 npm 镜像（registry.npmmirror.com）
├── .gitignore
├── package.json        # pnpm 管理
├── tsconfig.json
├── README.md
├── data/               # 运行后生成（已 gitignore）
│   ├── sample-logs.jsonl
│   ├── sample-logs.jsonl.zst
│   └── big-logs.jsonl.zst
└── src/
    ├── config.ts       # 目录 / 文件路径 / 压缩级别 集中配置
    ├── types.ts        # LogRecord 类型定义
    ├── jsonl-zstd.ts   # 核心工具类（WASM 缓冲 + 流式 + 魔数检测）
    ├── compress.ts     # 演示：生成 JSONL + zstd 压缩 + 体积对比
    ├── decompress.ts   # 演示：解压读取 + 过滤 error 日志
    ├── stream.ts       # 演示：流式写入 10 万条 + 流式逐行读取
    ├── lz-string-demo.ts # 演示：lz-string vs zstd 压缩率对比
    └── index.ts        # 综合入口：依次运行全部演示
```

## 核心工具类 `JsonlZstd`

| 方法 | 模式 | 依赖 | 说明 |
|------|------|------|------|
| `compressToFile(records, path, level)` | 缓冲 | `@bokuweb/zstd-wasm` | 记录数组 → `.jsonl.zst` |
| `decompressFromFile(path)` | 缓冲 | `@bokuweb/zstd-wasm` | `.jsonl.zst` → 记录数组 |
| `filterRead(path, filter)` | 缓冲 | `@bokuweb/zstd-wasm` | 解压 + 过滤 |
| `streamWrite(records, path, level)` | 流式 | `simple-zstd` | 边生成边压缩写入 |
| `streamRead(path, onRecord)` | 流式 | `simple-zstd` | 小块解压 + 逐行回调 |
| `isZstd(path)` | — | Node.js fs | 魔数检测是否 zstd 文件 |

## 压缩级别参考

| 级别 | 压缩率 | 速度 | 推荐场景 |
|------|--------|------|----------|
| 1-3 | 一般 | 极快 | 实时日志、高频写入 |
| 3-9（默认 3） | 较好 | 快 | **通用推荐** |
| 10-19 | 高 | 慢 | 归档、冷数据 |
