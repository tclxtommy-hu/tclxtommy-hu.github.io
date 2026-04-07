/**
 * generate-icons.js
 * Creates SVG/PNG icons for PWA and a favicon.ico.
 * Run once: node scripts/generate-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

function createSvgIcon(size) {
  const fontSize = Math.round(size * 0.3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#0a0a0f"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f0ff"/>
      <stop offset="50%" stop-color="#7b2fff"/>
      <stop offset="100%" stop-color="#ff2fc8"/>
    </linearGradient>
  </defs>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="900" font-size="${fontSize}" fill="url(#g)">200</text>
</svg>`;
}

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type: 1 = ICO
  header.writeUInt16LE(count, 4);   // number of images

  const entries = [];
  const images = [];
  let offset = dataOffset;

  for (const { size, png } of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size < 256 ? size : 0, 0);  // width
    entry.writeUInt8(size < 256 ? size : 0, 1);  // height
    entry.writeUInt8(0, 2);           // color palette
    entry.writeUInt8(0, 3);           // reserved
    entry.writeUInt16LE(1, 4);        // color planes
    entry.writeUInt16LE(32, 6);       // bits per pixel
    entry.writeUInt32LE(png.length, 8);  // image size
    entry.writeUInt32LE(offset, 12);     // image offset
    entries.push(entry);
    images.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

// Write SVG icons
for (const size of [192, 512]) {
  const svg = createSvgIcon(size);
  fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}.svg`), svg, 'utf-8');
}

// Generate PNG icons and favicon.ico
const icoSizes = [16, 32, 48];
const pngSizes = [192, 512];

const allSizes = [...new Set([...icoSizes, ...pngSizes])];

const pngBuffers = await Promise.all(
  allSizes.map(async (size) => {
    const svg = Buffer.from(createSvgIcon(size));
    const png = await sharp(svg).resize(size, size).png().toBuffer();
    return { size, png };
  })
);

// Write PNG files for PWA
for (const { size, png } of pngBuffers.filter(b => pngSizes.includes(b.size))) {
  fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}.png`), png);
}

// Build and write favicon.ico
const icoData = pngBuffers.filter(b => icoSizes.includes(b.size));
const ico = buildIco(icoData);
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), ico);

console.log('✅ Icons generated: SVG, PNG, and favicon.ico');
