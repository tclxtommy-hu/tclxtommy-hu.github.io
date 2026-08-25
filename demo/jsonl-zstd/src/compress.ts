import { writeFile, mkdir } from "node:fs/promises";
import { config, isMain } from "./config.js";
import { JsonlZstd } from "./jsonl-zstd.js";
import type { LogRecord } from "./types.js";

/**
 * 生成示例日志记录。
 */
function generateSampleLogs(count: number): LogRecord[] {
  const records: LogRecord[] = [];
  const messages = [
    "服务启动",
    "收到请求",
    "数据库查询完成",
    "缓存命中",
    "定时任务执行",
    "数据库连接失败",
    "请求超时",
    "磁盘空间不足",
  ];
  for (let i = 0; i < count; i++) {
    const level: LogRecord["level"] = i % 50 === 0 ? "error" : i % 20 === 0 ? "warn" : "info";
    records.push({
      id: i,
      level,
      msg: `${messages[i % messages.length]} #${i}`,
      ts: new Date(Date.now() + i * 1000).toISOString(),
    });
  }
  return records;
}

/**
 * 演示：生成 JSONL 原始文件 + zstd 压缩文件，并对比体积。
 */
async function main() {
  await mkdir(config.dataDir, { recursive: true });

  const records = generateSampleLogs(10_000);

  // 1. 写入未压缩的 JSONL（用于对照）
  const jsonlText = JsonlZstd.toJsonlText(records);
  await writeFile(config.jsonlFile, jsonlText, "utf-8");
  console.log(`📄 原始 JSONL 已写入: ${config.jsonlFile}`);
  console.log(`   原始大小: ${(Buffer.byteLength(jsonlText) / 1024).toFixed(1)} KB (${records.length} 条)\n`);

  // 2. 压缩为 .jsonl.zst
  const result = await JsonlZstd.compressToFile(records, config.zstFile, config.level);
  console.log(`📦 zstd 压缩完成 (level=${config.level}): ${config.zstFile}`);
  console.log(`   压缩后: ${(result.compressedBytes / 1024).toFixed(1)} KB`);
  console.log(`   压缩率: ${(result.compressedBytes / result.originalBytes * 100).toFixed(1)}% (约 ${Math.round(result.originalBytes / result.compressedBytes)}x)\n`);

  // 3. 检测是否为 zstd 文件
  const isZst = await JsonlZstd.isZstd(config.zstFile);
  console.log(`🔍 魔数检测: ${isZst ? "✅ 是 zstd 压缩文件" : "❌ 不是 zstd 文件"}\n`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { generateSampleLogs };
