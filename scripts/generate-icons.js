/**
 * generate-icons.js
 * Creates simple SVG-based PNG icons for PWA.
 * Run once: node scripts/generate-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

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

// Write SVG icons (GitHub Pages serves them fine, and they work as PWA icons in most browsers)
for (const size of [192, 512]) {
  const svg = createSvgIcon(size);
  fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}.svg`), svg, 'utf-8');
}

console.log('✅ Icons generated in public/icons/');
