import { stat } from "node:fs/promises";
import { config, isMain } from "./config.js";
import { JsonlZstd } from "./jsonl-zstd.js";
import { generateSampleLogs } from "./compress.js";
import type { LogRecord } from "./types.js";

/**
 * 演示：流式压缩写入 + 流式逐行读取（使用 simple-zstd，需系统安装 zstd）。
 *
 * 如果系统未安装 zstd 命令行工具，会给出提示并跳过。
 */
async function main() {
  const records = generateSampleLogs(config.bigLogCount);

  console.log(`🌊 流式压缩写入 ${config.bigLogCount} 条日志 → ${config.bigZstFile}\n`);

  // 1. 流式压缩写入
  await JsonlZstd.streamWrite(records, config.bigZstFile, config.level);
  const statInfo = await stat(config.bigZstFile);
  console.log(`   ✅ 写入完成，文件大小: ${(statInfo.size / 1024).toFixed(1)} KB\n`);

  // 2. 流式逐行读取，统计 error 数量
  let errorCount = 0;
  let totalCount = 0;
  console.log("📖 流式逐行读取中...\n");
  const count = await JsonlZstd.streamRead(config.bigZstFile, (record, i) => {
    totalCount++;
    if (record.level === "error") errorCount++;
    if (i > 0 && i % 20_000 === 0) {
      console.log(`   进度: 已处理 ${i} 条`);
    }
  });

  console.log(`\n   ✅ 读取完成: 共 ${count} 条，其中 error ${errorCount} 条\n`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error("❌ 流式演示失败。");
    console.error("   simple-zstd 需要系统安装 zstd 命令行工具。");
    console.error("   Windows: choco install zstd  或  scoop install zstd");
    console.error("   macOS:   brew install zstd");
    console.error("   Ubuntu:  sudo apt install zstd");
    console.error("");
    console.error(err);
    process.exit(1);
  });
}
