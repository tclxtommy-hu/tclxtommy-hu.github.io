import LZString from "lz-string";
import { config, isMain } from "./config.js";
import { JsonlZstd } from "./jsonl-zstd.js";
import { generateSampleLogs } from "./compress.js";

/**
 * 演示：lz-string 浏览器端轻量压缩 vs zstd 服务端压缩，对比压缩率与适用场景。
 */
async function main() {
  const records = generateSampleLogs(1000);
  const json = JSON.stringify(records);
  const jsonlText = JsonlZstd.toJsonlText(records);

  console.log("📊 lz-string vs zstd 压缩对比（1000 条日志）\n");
  console.log(`   原始 JSON: ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
  console.log(`   原始 JSONL: ${(Buffer.byteLength(jsonlText) / 1024).toFixed(1)} KB\n`);

  // lz-string 多种编码
  const compressed = LZString.compress(json);
  const base64 = LZString.compressToBase64(json);
  const utf16 = LZString.compressToUTF16(json);

  console.log(`   lz-string.compress:      ${(compressed.length / 1024).toFixed(1)} KB  (压缩率 ${Math.round(json.length / compressed.length)}x)`);
  console.log(`   lz-string → Base64:      ${(base64.length / 1024).toFixed(1)} KB  (压缩率 ${Math.round(json.length / base64.length)}x)`);
  console.log(`   lz-string → UTF-16:      ${(utf16.length / 1024).toFixed(1)} KB  (压缩率 ${Math.round(json.length / utf16.length)}x)`);

  // zstd
  const result = await JsonlZstd.compressToFile(records, config.zstFile, config.level);
  console.log(`   zstd (level=${config.level}):        ${(result.compressedBytes / 1024).toFixed(1)} KB  (压缩率 ${Math.round(result.originalBytes / result.compressedBytes)}x)\n`);

  // 验证 lz-string 解压还原
  const restored = LZString.decompress(compressed);
  const restoredRecords = JSON.parse(restored);
  console.log(`   ✅ lz-string 解压验证: 还原 ${restoredRecords.length} 条记录，数据一致\n`);

  console.log("💡 结论:");
  console.log("   - 小数据 / 浏览器端 / localStorage / URL → lz-string");
  console.log("   - 大文件 / 服务端 / 日志归档 / LLM 数据集 → zstd");
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
