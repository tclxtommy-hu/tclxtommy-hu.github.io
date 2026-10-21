/**
 * images.js
 * 正文配图的构建期优化：public/images 下的 PNG/JPEG 各生成一份同目录 WebP
 * （截图类图片通常只有原来的 1/10），同时把宽高回传给 build-posts.js，
 * 让 <img> 带上 width/height —— 浏览器在图片加载前就能占好位置，消掉 CLS。
 *
 * 设计取舍：
 *   - 原图保留在仓库里（不删），WebP 只是"派生物"，随时可以重新生成；
 *   - 用 mtime 判断是否需要重新转：webp 比原图新就跳过，所以第二次构建几乎零成本；
 *   - 只做有损 WebP q82：正文截图在这个质量下基本看不出差别，体积却降一个数量级。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const PUBLIC_DIR = path.join(ROOT, 'public');

/** 有损 WebP 质量：截图上 82 已经很难看出压缩痕迹，再高只是白涨体积 */
const WEBP_QUALITY = 82;
const IMAGE_EXT_RE = /\.(?:png|jpe?g)$/i;

/** 统一成 / 分隔的相对路径（Windows 下 path.relative 会给反斜杠） */
function toUrlPath(p) {
  return p.replace(/\\/g, '/');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && IMAGE_EXT_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** 原图比 webp 新（或 webp 不存在）才需要重新转 */
function needsConvert(source, target) {
  if (!fs.existsSync(target)) return true;
  return fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs;
}

/** 转了一张就打个日志，方便发现"为什么构建变慢了" */
async function convert(source, target) {
  await sharp(source)
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toFile(target);
}

/**
 * 扫描 public/images，按需生成 WebP，返回"原图公开路径 → 优化后信息"的索引。
 *
 *   '/images/02-RAG-core-concepts/01.png'
 *     → { src: '/images/02-RAG-core-concepts/01.webp', width: 1080, height: 690 }
 *
 * @param {{ force?: boolean }} [options] force = 忽略 mtime，全部重转
 * @returns {Promise<Map<string, { src: string, width: number, height: number }>>}
 */
export async function buildImageIndex({ force = false } = {}) {
  const index = new Map();
  const files = walk(IMAGES_DIR);
  if (files.length === 0) return index;

  let converted = 0;
  let originalBytes = 0;
  let webpBytes = 0;

  for (const source of files) {
    const webpPath = source.replace(IMAGE_EXT_RE, '.webp');
    if (force || needsConvert(source, webpPath)) {
      await convert(source, webpPath);
      originalBytes += fs.statSync(source).size;
      webpBytes += fs.statSync(webpPath).size;
      converted += 1;
    }

    let meta;
    try {
      meta = await sharp(webpPath).metadata();
    } catch {
      // 万一某张图坏了，宁可退回原图，也别让整站构建挂掉
      continue;
    }
    if (!meta.width || !meta.height) continue;

    index.set(`/${toUrlPath(path.relative(PUBLIC_DIR, source))}`, {
      src: `/${toUrlPath(path.relative(PUBLIC_DIR, webpPath))}`,
      width: meta.width,
      height: meta.height,
    });
  }

  if (converted > 0) {
    const from = Math.round(originalBytes / 1024);
    const to = Math.round(webpBytes / 1024);
    const ratio = originalBytes ? Math.round((1 - webpBytes / originalBytes) * 100) : 0;
    console.log(`🖼  WebP: ${converted} image(s) converted, ${from}KB → ${to}KB (-${ratio}%)`);
  }

  return index;
}

// 直接 `node scripts/images.js` 时强制全部重转（改了质量参数、或想确认转码结果时用）。
// 构建流程里由 build-posts.js 导入调用，走的是"按 mtime 增量"的路径。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = await buildImageIndex({ force: true });
  console.log(`✅ ${index.size} image(s) indexed`);
}
