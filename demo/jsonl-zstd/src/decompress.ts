import { config, isMain } from "./config.js";
import { JsonlZstd } from "./jsonl-zstd.js";

/**
 * 演示：解压 .jsonl.zst 并读取记录，展示过滤能力。
 */
async function main() {
  // 1. 全量解压读取
  const records = await JsonlZstd.decompressFromFile(config.zstFile);
  console.log(`📖 解压读取完成: 共 ${records.length} 条记录\n`);
  console.log("前 5 条:");
  for (const r of records.slice(0, 5)) {
    console.log(`  ${JSON.stringify(r)}`);
  }
  console.log();

  // 2. 过滤读取：只保留 error 级别
  const errors = await JsonlZstd.filterRead(config.zstFile, (r) => r.level === "error");
  console.log(`🔴 过滤出 error 级别日志: 共 ${errors.length} 条`);
  for (const e of errors.slice(0, 5)) {
    console.log(`  ${JSON.stringify(e)}`);
  }
  if (errors.length > 5) console.log(`  ... (还有 ${errors.length - 5} 条)`);
  console.log();
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
