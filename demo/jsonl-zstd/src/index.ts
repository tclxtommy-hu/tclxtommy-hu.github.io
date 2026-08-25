import { config, isMain } from "./config.js";
import { generateSampleLogs } from "./compress.js";
import { JsonlZstd } from "./jsonl-zstd.js";

/**
 * 综合入口：依次运行压缩 → 解压 → 流式 → lz-string 对照。
 * 流式部分依赖系统 zstd，失败时跳过并继续。
 */
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   JSONL + zstd Demo  (Node.js + TypeScript)   ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── 1. 压缩 ──
  console.log("━━━ 1. 压缩 JSONL → .jsonl.zst ━━━\n");
  const records = generateSampleLogs(10_000);
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(config.jsonlFile, JsonlZstd.toJsonlText(records), "utf-8");
  const result = await JsonlZstd.compressToFile(records, config.zstFile, config.level);
  console.log(`  原始: ${(result.originalBytes / 1024).toFixed(1)} KB → 压缩: ${(result.compressedBytes / 1024).toFixed(1)} KB (约 ${Math.round(result.originalBytes / result.compressedBytes)}x)`);
  console.log(`  魔数检测: ${await JsonlZstd.isZstd(config.zstFile) ? "✅ zstd" : "❌ 非 zstd"}\n`);

  // ── 2. 解压 ──
  console.log("━━━ 2. 解压 .jsonl.zst 并过滤 ━━━\n");
  const all = await JsonlZstd.decompressFromFile(config.zstFile);
  const errors = all.filter((r) => r.level === "error");
  console.log(`  解压 ${all.length} 条，其中 error ${errors.length} 条\n`);

  // ── 3. 流式（可选，需系统 zstd）──
  console.log("━━━ 3. 流式压缩/读取（simple-zstd）━━━\n");
  try {
    const { streamWrite, streamRead } = JsonlZstd;
    const bigRecords = generateSampleLogs(50_000);
    await streamWrite(bigRecords, config.bigZstFile, config.level);
    let cnt = 0;
    const n = await streamRead(config.bigZstFile, () => { cnt++; });
    console.log(`  ✅ 流式写入 50,000 条并读回 ${n} 条\n`);
  } catch (e) {
    console.log(`  ⏭️  跳过流式演示（需系统安装 zstd 命令行工具）\n`);
  }

  // ── 4. lz-string 对照 ──
  console.log("━━━ 4. lz-string 对照 ━━━\n");
  const { default: LZString } = await import("lz-string");
  const sample = generateSampleLogs(1000);
  const json = JSON.stringify(sample);
  const lz = LZString.compress(json);
  console.log(`  lz-string: ${json.length} → ${lz.length} 字节 (约 ${Math.round(json.length / lz.length)}x)`);
  console.log(`  zstd:      ${result.originalBytes} → ${result.compressedBytes} 字节 (约 ${Math.round(result.originalBytes / result.compressedBytes)}x)\n`);

  console.log("✅ 全部演示完成。");
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
