# 日志处理（JSONL + zstd）技术栈详解

> 最后修改时间：2026-08-25 14:30

## 一、概述

在大规模日志、爬虫数据、LLM 训练数据集等场景中，单文件动辄几十 GB 甚至上百 GB。直接用 JSON 数组存储既占空间又无法流式处理。**JSONL + zstd** 是目前业界主流的"结构化 + 高效压缩"组合方案。

| 组成 | 角色 | 说明 |
|------|------|------|
| **JSONL** | 数据格式 | JSON Lines，每行一个独立 JSON 对象，换行分隔 |
| **zstd** | 压缩算法 | Zstandard，Facebook 开源，速度快、压缩率高 |

合起来就是：**用 zstd 算法压缩后的 JSONL 文件，后缀常见 `.jsonl.zst`**。

### 为什么要压缩

zstd 压缩的目的：

1. **减少磁盘 / 对象存储占用**——大文件落地存储成本直接降低；
2. **减少网络传输的数据量**——加快上传下载速度、节省带宽流量。

本质是：**用 CPU 算力开销，换取存储与 IO / 带宽收益**。

对于 JSONL 数据集，因为文本冗余高（字段名重复、结构相似），压缩收益非常可观，通常能压缩到原大小的 **1/5 ~ 1/10**。

| 收益维度 | 说明 |
|----------|------|
| 存储成本 | 磁盘 / 对象存储占用大幅下降 |
| 网络 IO | 上传下载更快，带宽费用更低 |
| 代价 | CPU 压缩 / 解压计算开销（zstd 速度极快，代价很小） |

---

## 二、JSONL 是什么

> JSON Lines，后缀 `.jsonl`

- 每一行是一个独立完整的 JSON 对象，**一行一条记录**
- 行与行之间没有逗号，不是数组，直接换行分隔

### 示例

```json
{"id":1,"name":"a","ts":"2026-08-25T10:00:00Z"}
{"id":2,"name":"b","ts":"2026-08-25T10:01:00Z"}
{"id":3,"name":"c","ts":"2026-08-25T10:02:00Z"}
```

### 特点

- 适合存储海量日志、数据集、爬虫数据
- **可以按行读取**，不用一次性把整个大文件加载进内存
- 每行独立，损坏一行不影响其他行解析

### 与 JSON 数组对比

```json
// ❌ JSON 数组：必须一次性读取全部，内存爆炸
[
  {"id":1,"name":"a"},
  {"id":2,"name":"b"},
  {"id":3,"name":"c"}
]

// ✅ JSONL：逐行读取，内存友好
{"id":1,"name":"a"}
{"id":2,"name":"b"}
{"id":3,"name":"c"}
```

---

## 三、zstd 是什么

> Zstandard，Facebook（Meta）开源的压缩算法，命令行工具叫 `zstd`

### 核心优势

| 指标 | zstd | gzip | lz4 | bzip2 |
|------|------|------|-----|-------|
| 压缩速度 | 快 | 一般 | 极快 | 慢 |
| 解压速度 | **极快** | 一般 | 极快 | 慢 |
| 压缩率 | 好 | 一般 | 较低 | 好 |
| 大数据集流行度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |

### 命令行操作

```bash
# 压缩 jsonl → jsonl.zst
zstd data.jsonl

# 解压 jsonl.zst → jsonl
zstd -d data.jsonl.zst

# 指定压缩级别（1-19，默认 3，越高压缩率越好但越慢）
zstd -19 data.jsonl

# 多线程压缩
zstd -T0 data.jsonl
```

### 如何判断文件是否是 zstd 压缩

1. **看后缀**：`.zst` 或 `.jsonl.zst`
2. **看文件头魔数**：zstd 文件以 `0x28 0xB5 0x2F 0xFD` 开头
3. **命令行检测**：

#### 什么是魔数（Magic Number）

> 魔数是写在**文件开头固定位置**的几个特殊字节，用来唯一标识文件格式。

- 又叫「文件签名」「文件头标识」，是文件格式规范里**约定好的固定字节序列**。
- 程序只需读取文件前几个字节，和已知魔数比对，就能**快速判断这是什么类型的文件**，而不必解析整个文件内容。
- 几乎所有二进制格式都有魔数：PNG、PDF、ZIP、GZIP……各有各的固定开头。

**为什么需要魔数**：文件后缀（`.zst` / `.jpg`）只是给人和操作系统看的，可以被随意改名伪装。魔数写在文件二进制内容里，改后缀也改不掉，是**判断真实格式最可靠的方式**。

| 文件格式 | 魔数（十六进制） | 说明 |
|----------|------------------|------|
| **zstd** | `28 B5 2F FD` | Zstandard 压缩文件 |
| gzip | `1F 8B` | gzip 压缩文件 |
| PNG | `89 50 4E 47` | PNG 图片（`‰PNG`） |
| PDF | `25 50 44 46` | PDF 文档（`%PDF`） |
| ZIP | `50 4B 03 04` | ZIP 压缩包（`PK`） |

**zstd 魔数详解**：`0x28 0xB5 0x2F 0xFD`（共 4 字节）

```bash
# 用 xxd 查看文件前几个字节
xxd data.jsonl.zst | head -1
# → 00000000: 28b5 2ffd ...  ← 开头就是 zstd 魔数
```

```js
// Node.js 读取前 4 字节判断是否 zstd
function isZstd(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);  // 只读前 4 字节
  fs.closeSync(fd);
  return (
    buf[0] === 0x28 &&
    buf[1] === 0xb5 &&
    buf[2] === 0x2f &&
    buf[3] === 0xfd
  );
}
```

> 💡 魔数判断比后缀可靠、比 `file` 命令轻量，是程序里做格式识别的标准做法。

```bash
file data.jsonl.zst
# 输出: data.jsonl.zst: Zstandard compressed data
```

---

## 四、zstd 压缩的 JSONL：`.jsonl.zst`

### 原理

- **原始内容**：多行 JSON（JSONL）
- **外层**：被 zstd 二进制压缩包裹
- 不能直接用文本编辑器打开，看到的是乱码，**必须先解压才能看到 JSON 文本**

### 为什么不能直接按行读压缩文件

> zstd 是**整体二进制压缩**，原始的 `\n` 换行标记已经被压缩编码混在二进制流里面，磁盘上的 `.zst` 文件本身不再有肉眼可见的换行符。

```
# ❌ 错误！不能直接 for line in fs.readFileSync("xxx.jsonl.zst")
# 读到的是压缩二进制碎片，不是原始 json 行
```

必须：**一边流式解压，一边在解压出来的字节流里面找换行符**。

### 流式处理流程

```
磁盘 → 读取一小块二进制 → zstd 流式解压 → 输出解压后的原始字节流 → 识别 \n 切分行 → 逐行处理
```

不会把整个 100G 文件全部解压到内存，是**小块流式解压 + 逐行切分**。

### 形象比喻

| 文件类型 | 比喻 |
|----------|------|
| `.jsonl` | 一本打印好的书，每行文字直接印在纸上，看一行撕一行，不用抱整本书 |
| `.jsonl.zst` | 书被压缩成密封铅块，看不到文字，得一点点拆开，拆出一页看一页，看完丢掉再拆 |

### 常见使用场景

- 大模型训练数据集（HuggingFace 大量数据集就是 `xxx.jsonl.zst`）
- 爬虫导出数据
- 日志备份与归档
- LLM 公开数据集分发

---

## 五、Node.js 实战

### 5.1 安装依赖

```bash
npm install @mongodb-js/zstd
# 或
npm install simple-zstd
# 或使用原生绑定
npm install @bokuweb/zstd-wasm
```

推荐使用 `@mongodb-js/zstd`，API 简洁且维护活跃：

```bash
npm install @mongodb-js/zstd
```

### 5.2 压缩 JSONL 文件

```js
const fs = require('fs');
const readline = require('readline');
const { compress } = require('@mongodb-js/zstd');

async function writeJsonlZst(records, outputPath, level = 3) {
  // 1. 先把记录写成 JSONL 文本
  const jsonlContent = records
    .map((r) => JSON.stringify(r))
    .join('\n');

  // 2. 用 zstd 压缩
  const inputBuf = Buffer.from(jsonlContent, 'utf-8');
  const compressed = await compress(inputBuf, level);

  // 3. 写入文件
  fs.writeFileSync(outputPath, compressed);
  console.log(`✅ 已压缩 ${records.length} 条记录 → ${outputPath}`);
}

// 使用示例
const logs = [
  { id: 1, level: 'info', msg: '服务启动', ts: '2026-08-25T10:00:00Z' },
  { id: 2, level: 'error', msg: '数据库连接失败', ts: '2026-08-25T10:01:00Z' },
  { id: 3, level: 'info', msg: '重连成功', ts: '2026-08-25T10:02:00Z' },
];

writeJsonlZst(logs, 'logs.jsonl.zst', 3);
```

### 5.3 解压并逐行读取（流式）

```js
const fs = require('fs');
const { decompress } = require('@mongodb-js/zstd');

async function readJsonlZst(filePath) {
  // 1. 读取压缩文件
  const compressed = fs.readFileSync(filePath);

  // 2. 解压成原始字节
  const decompressed = await decompress(compressed);

  // 3. 转字符串后按行切分
  const text = decompressed.toString('utf-8');
  const lines = text.split('\n').filter(Boolean);

  // 4. 逐行解析 JSON
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch (e) {
      console.warn('⚠️ 跳过无法解析的行:', line.slice(0, 100));
    }
  }
  return records;
}

// 使用示例
readJsonlZst('logs.jsonl.zst').then((records) => {
  console.log(`共读取 ${records.length} 条记录`);
  records.forEach((r) => console.log(r));
});
```

### 5.4 大文件流式处理（不一次性加载到内存）

对于超大文件，使用流式解压 + 逐行读取：

```js
const fs = require('fs');
const { ZstdCompress, ZstdDecompress } = require('simple-zstd');
const readline = require('readline');

async function streamReadJsonlZst(filePath, onRecord) {
  // 创建可读流 → zstd 解压流 → 按行切分
  const readStream = fs.createReadStream(filePath);
  const decompressStream = new ZstdDecompress();

  const rl = readline.createInterface({
    input: readStream.pipe(decompressStream),
    crlfDelay: Infinity,
  });

  let count = 0;
  for await (const line of rl) {
    try {
      const record = JSON.parse(line);
      await onRecord(record, count++);
    } catch (e) {
      console.warn(`⚠️ 第 ${count} 行解析失败:`, e.message);
    }
  }
  console.log(`✅ 处理完成，共 ${count} 条`);
}

// 使用示例：处理 100GB 日志，内存只占一行
streamReadJsonlZst('huge-logs.jsonl.zst', async (record, i) => {
  if (i % 100000 === 0) console.log(`进度: ${i}`);
  // 在这里处理每条记录，比如写入数据库、过滤等
  if (record.level === 'error') {
    // 只处理 error 级别日志
  }
});
```

### 5.5 流式压缩写入（边生成边压缩）

```js
const fs = require('fs');
const { ZstdCompress } = require('simple-zstd');

async function streamWriteJsonlZst(records, outputPath, level = 3) {
  const writeStream = fs.createWriteStream(outputPath);
  const compressStream = new ZstdCompress(level);

  // 管道：数据 → zstd 压缩 → 写入文件
  compressStream.pipe(writeStream);

  for (const record of records) {
    compressStream.write(JSON.stringify(record) + '\n');
  }

  compressStream.end();
  return new Promise((resolve) => writeStream.on('finish', resolve));
}

// 使用示例：流式写入百万条日志
async function generateLogs(outputPath) {
  const records = [];
  for (let i = 0; i < 1000000; i++) {
    records.push({
      id: i,
      level: i % 100 === 0 ? 'error' : 'info',
      msg: `日志条目 ${i}`,
      ts: new Date().toISOString(),
    });
  }
  await streamWriteJsonlZst(records, outputPath, 3);
  console.log('✅ 流式压缩写入完成');
}

generateLogs('million-logs.jsonl.zst');
```

### 5.6 完整工具类封装

```js
const fs = require('fs');
const readline = require('readline');
const { ZstdCompress, ZstdDecompress } = require('simple-zstd');

/**
 * JSONL + zstd 日志工具类
 * 提供压缩、解压、流式读写能力
 */
class JsonlZstd {
  /**
   * 流式压缩写入
   * @param {string} outputPath - 输出文件路径
   * @param {number} level - 压缩级别 1-19，默认 3
   * @returns {Object} { write(record), end() }
   */
  static createWriter(outputPath, level = 3) {
    const writeStream = fs.createWriteStream(outputPath);
    const compressStream = new ZstdCompress(level);
    compressStream.pipe(writeStream);

    return {
      /** 写入一条记录 */
      write(record) {
        compressStream.write(JSON.stringify(record) + '\n');
      },
      /** 结束写入 */
      end() {
        compressStream.end();
        return new Promise((resolve) => writeStream.on('finish', resolve));
      },
    };
  }

  /**
   * 流式逐行读取
   * @param {string} filePath - 输入文件路径
   * @param {Function} onRecord - 每条记录的回调 (record, index) => void | Promise
   */
  static async streamRead(filePath, onRecord) {
    const readStream = fs.createReadStream(filePath);
    const decompressStream = new ZstdDecompress();

    const rl = readline.createInterface({
      input: readStream.pipe(decompressStream),
      crlfDelay: Infinity,
    });

    let count = 0;
    for await (const line of rl) {
      try {
        const record = JSON.parse(line);
        await onRecord(record, count++);
      } catch (e) {
        console.warn(`⚠️ 第 ${count} 行解析失败:`, e.message);
      }
    }
    return count;
  }

  /**
   * 过滤读取：只保留满足条件的记录
   * @param {string} filePath - 输入文件路径
   * @param {Function} filter - 过滤函数 record => boolean
   * @returns {Array} 过滤后的记录数组
   */
  static async filterRead(filePath, filter) {
    const results = [];
    await this.streamRead(filePath, async (record) => {
      if (filter(record)) results.push(record);
    });
    return results;
  }
}

module.exports = { JsonlZstd };
```

使用示例：

```js
const { JsonlZstd } = require('./jsonl-zstd');

// 写入日志
async function writeLogs() {
  const writer = JsonlZstd.createWriter('app-logs.jsonl.zst', 3);
  for (let i = 0; i < 10000; i++) {
    writer.write({
      id: i,
      level: i % 200 === 0 ? 'error' : 'info',
      msg: `事件 ${i}`,
      ts: new Date().toISOString(),
    });
  }
  await writer.end();
  console.log('✅ 写入完成');
}

// 读取并过滤 error 日志
async function readErrors() {
  const errors = await JsonlZstd.filterRead(
    'app-logs.jsonl.zst',
    (r) => r.level === 'error'
  );
  console.log(`共 ${errors.length} 条 error 日志`);
  errors.forEach((e) => console.log(e));
}

writeLogs().then(readErrors);
```

---

## 六、其他常见压缩算法对比

| 算法 | 后缀 | 压缩率 | 速度 | 适用场景 |
|------|------|--------|------|----------|
| **zstd** | `.zst` | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 大数据集、日志、LLM 训练数据 |
| **gzip** | `.gz` | ⭐⭐⭐ | ⭐⭐⭐ | 通用压缩、Web 传输 |
| **bzip2** | `.bz2` | ⭐⭐⭐⭐ | ⭐⭐ | 归档、高压缩率需求 |
| **lz4** | `.lz4` | ⭐⭐ | ⭐⭐⭐⭐⭐ | 极速压缩、实时场景 |
| **xz** | `.xz` | ⭐⭐⭐⭐⭐ | ⭐ | 软件包分发、最高压缩率 |
| **snappy** | `.snappy` | ⭐⭐ | ⭐⭐⭐⭐⭐ | 列式存储（Parquet/ORC） |

### 选择建议

- **追求综合性能（速度+压缩率）**：zstd ✅
- **追求极致速度**：lz4 / snappy
- **追求极致压缩率**：xz / bzip2
- **兼容性优先**：gzip

### 补充：lz-string（浏览器端轻量压缩）

> LZ-String，JavaScript 环境下的轻量级字符串压缩库，基于 LZ 算法变体。

与 zstd 定位不同，lz-string 面向**浏览器端、小到中等体积的字符串/JSON** 压缩场景。

| 维度 | lz-string | zstd |
|------|-----------|------|
| **实现** | 纯 JS，无原生依赖 | C 实现，Node.js 用 WASM/原生绑定 |
| **压缩率** | 中等（文本约 2-5x） | 高（文本约 5-10x） |
| **速度** | 中等 | 极快（原生级） |
| **输出** | 字符串 | 二进制 |
| **流式处理** | ❌ 不支持 | ✅ 支持流式压缩/解压 |
| **大文件** | ❌ 全量加载到内存 | ✅ 可逐行流式处理 |
| **适用场景** | localStorage、URL 参数、小 JSON 压缩 | 大数据集、日志归档、LLM 训练数据 |
| **浏览器友好** | ⭐⭐⭐⭐⭐ 开箱即用 | ⭐⭐ 需引入 WASM |

#### 安装与基本用法

```bash
npm install lz-string
```

```js
const LZString = require('lz-string');

// 压缩 JSON 字符串
const json = JSON.stringify({ id: 1, msg: 'hello', data: '...'.repeat(1000) });
const compressed = LZString.compress(json);
console.log(`原: ${json.length} → 压缩: ${compressed.length}`);

// 解压
const restored = LZString.decompress(compressed);
console.log(JSON.parse(restored));

// 压缩到 Base64（适合 URL 传输）
const base64 = LZString.compressToBase64(json);
const restored2 = LZString.decompressFromBase64(base64);

// 压缩到 UTF-16（适合 localStorage）
const utf16 = LZString.compressToUTF16(json);
const restored3 = LZString.decompressFromUTF16(utf16);
```

#### 选择建议

- **小数据、浏览器端、存 localStorage / URL**：用 **lz-string** ✅
- **大文件、服务端、日志/数据集归档**：用 **zstd** ✅
- 两者不冲突，可按场景搭配使用

---

## 七、zstd 两种压缩模式

| 模式 | 说明 | 流式处理 |
|------|------|----------|
| **流式压缩（默认）** | 数据分帧压缩，可 stream_reader 小块解压 | ✅ 支持逐行处理 |
| **单块压缩** | 全部内容一次性压缩成单块 | ⚠️ 部分流式库不友好 |

> HuggingFace 等数据集均使用流式压缩格式，可逐行处理。

---

## 八、常见问题

### Q1: zstd 压缩的 JSONL 文件如何解压？

```bash
# 命令行
zstd -d data.jsonl.zst          # 解压为 data.jsonl
zstd -d data.jsonl.zst -o out   # 指定输出文件名

# Node.js
const { decompress } = require('@mongodb-js/zstd');
const buf = fs.readFileSync('data.jsonl.zst');
const text = (await decompress(buf)).toString('utf-8');
```

### Q2: 如何判断文件是否是 zstd 压缩？

```bash
# 方法1: 看后缀 .zst / .jsonl.zst
# 方法2: file 命令
file data.jsonl.zst
# → data.jsonl.zst: Zstandard compressed data

# 方法3: 检查魔数
xxd data.jsonl.zst | head -1
# → 00000000: 28b5 2ffd ...  (魔数 0x28B52FFD)
```

Node.js 检测：

```js
function isZstd(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  // zstd 魔数: 0x28 0xB5 0x2F 0xFD
  return buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd;
}
```

### Q3: 压缩级别怎么选？

| 级别 | 压缩率 | 速度 | 推荐场景 |
|------|--------|------|----------|
| 1-3 | 一般 | 极快 | 实时日志、高频写入 |
| 3-9（默认 3） | 较好 | 快 | **通用推荐** |
| 10-19 | 高 | 慢 | 归档、冷数据 |

---

## 九、一句话总结

> **zstd 压缩的 JSONL = 一条条 JSON 换行存放的文本文件，再用 zstd 做高效压缩，常用于存储大规模结构化数据。Node.js 中通过流式解压 + readline 即可实现低内存的逐行处理。**
