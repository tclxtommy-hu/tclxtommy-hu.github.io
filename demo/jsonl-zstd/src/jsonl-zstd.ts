import { readFile, writeFile, open } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { init as zstdInit, compress as zstdCompressBuf, decompress as zstdDecompressBuf } from "@bokuweb/zstd-wasm";
import type { Duplex } from "node:stream";
import type { LogRecord } from "./types.js";

/** zstd 文件魔数：0x28 0xB5 0x2F 0xFD */
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** WASM 初始化状态，避免重复 init */
let wasmReady = false;

/** 确保 WASM 模块已初始化（幂等） */
async function ensureInit(): Promise<void> {
  if (!wasmReady) {
    await zstdInit();
    wasmReady = true;
  }
}

/**
 * JSONL + zstd 日志工具类。
 *
 * - 缓冲模式（compress / decompress / filterRead）使用 `@bokuweb/zstd-wasm`，纯 WASM，**无需系统安装 zstd，无需原生编译**。
 * - 流式模式（streamWrite / streamRead）使用 `simple-zstd`，需要系统安装 zstd 命令行工具。
 */
export class JsonlZstd {
  /* ---------- 缓冲模式（@bokuweb/zstd-wasm，纯 WASM，跨平台零依赖） ---------- */

  /**
   * 将记录数组压缩写入 `.jsonl.zst` 文件。
   * 适合中小体积数据；大文件请用 {@link streamWrite}。
   *
   * @param records  记录数组
   * @param outputPath 输出路径
   * @param level    压缩级别 1-19，默认 3
   */
  static async compressToFile(
    records: LogRecord[],
    outputPath: string,
    level: number = 3,
  ): Promise<{ records: number; originalBytes: number; compressedBytes: number }> {
    await ensureInit();
    const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const inputBuf = Buffer.from(jsonl, "utf-8");
    const compressed = Buffer.from(zstdCompressBuf(new Uint8Array(inputBuf), level));
    await writeFile(outputPath, compressed);
    return {
      records: records.length,
      originalBytes: inputBuf.length,
      compressedBytes: compressed.length,
    };
  }

  /**
   * 解压 `.jsonl.zst` 文件并返回全部记录。
   * 适合中小体积数据；大文件请用 {@link streamRead}。
   *
   * @param filePath 输入路径
   * @returns 解析出的记录数组
   */
  static async decompressFromFile(filePath: string): Promise<LogRecord[]> {
    await ensureInit();
    const compressed = await readFile(filePath);
    const decompressed = Buffer.from(zstdDecompressBuf(new Uint8Array(compressed)));
    const text = decompressed.toString("utf-8");
    const records: LogRecord[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed) as LogRecord);
      } catch (e) {
        console.warn(`⚠️ 跳过无法解析的行: ${trimmed.slice(0, 100)}`);
      }
    }
    return records;
  }

  /**
   * 过滤读取：解压后只保留满足条件的记录。
   *
   * @param filePath 输入路径
   * @param filter   过滤函数
   */
  static async filterRead(
    filePath: string,
    filter: (r: LogRecord) => boolean,
  ): Promise<LogRecord[]> {
    const all = await this.decompressFromFile(filePath);
    return all.filter(filter);
  }

  /* ---------- 流式模式（simple-zstd，需系统安装 zstd） ---------- */

  /**
   * 流式压缩写入：边生成边压缩，内存友好。
   *
   * @param records   记录数组（也可改为异步迭代器以支持无限流）
   * @param outputPath 输出路径
   * @param level     压缩级别
   */
  static async streamWrite(
    records: Iterable<LogRecord> | AsyncIterable<LogRecord>,
    outputPath: string,
    level: number = 3,
  ): Promise<void> {
    const { compress: zstdCompressStream } = await import("simple-zstd");
    const compressStream: Duplex = await zstdCompressStream(level);
    const writeStream = createWriteStream(outputPath);
    compressStream.pipe(writeStream);

    for await (const record of records) {
      compressStream.write(JSON.stringify(record) + "\n");
    }
    compressStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
  }

  /**
   * 流式逐行读取：小块解压 + 逐行切分，内存只占一行。
   *
   * @param filePath 输入路径
   * @param onRecord 每条记录的回调
   * @returns 处理的记录总数
   */
  static async streamRead(
    filePath: string,
    onRecord: (record: LogRecord, index: number) => void | Promise<void>,
  ): Promise<number> {
    const { decompress: zstdDecompressStream } = await import("simple-zstd");
    const decompressStream: Duplex = await zstdDecompressStream();
    const readStream = createReadStream(filePath);

    const rl = createInterface({
      input: readStream.pipe(decompressStream),
      crlfDelay: Infinity,
    });

    let count = 0;
    for await (const line of rl) {
      try {
        const record = JSON.parse(line) as LogRecord;
        await onRecord(record, count++);
      } catch (e) {
        console.warn(`⚠️ 第 ${count} 行解析失败: ${(e as Error).message}`);
      }
    }
    return count;
  }

  /* ---------- 工具方法 ---------- */

  /**
   * 检测文件是否为 zstd 压缩（读取前 4 字节魔数）。
   *
   * @param filePath 文件路径
   * @returns 是否为 zstd 压缩
   */
  static async isZstd(filePath: string): Promise<boolean> {
    const handle = await open(filePath, "r");
    try {
      const buf = Buffer.alloc(4);
      const { bytesRead } = await handle.read(buf, 0, 4, 0);
      if (bytesRead < 4) return false;
      return ZSTD_MAGIC.every((byte, i) => buf[i] === byte);
    } finally {
      await handle.close();
    }
  }

  /**
   * 将记录数组转为 JSONL 文本（不压缩），用于对照原始体积。
   */
  static toJsonlText(records: LogRecord[]): string {
    return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  }
}
