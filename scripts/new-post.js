/**
 * new-post.js
 * Create a new post markdown file and optionally an image directory.
 * Usage: node scripts/new-post.js <slug>
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: yarn new <slug>');
  process.exit(1);
}

const mdPath = path.join(POSTS_DIR, `${slug}.md`);
if (fs.existsSync(mdPath)) {
  console.error(`Post already exists: posts/${slug}.md`);
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // Create markdown file
  const frontmatter = `---
title: ${slug}
date: ${today}
tags: []
---

# ${slug}
`;
  fs.writeFileSync(mdPath, frontmatter, 'utf-8');
  console.log(`Created: posts/${slug}.md`);

  // Ask about image directory
  const answer = await ask('Need image directory? (y/N) ');
  if (answer.trim().toLowerCase() === 'y') {
    const imgDir = path.join(IMAGES_DIR, slug);
    fs.mkdirSync(imgDir, { recursive: true });
    console.log(`Created: public/images/${slug}/`);
  }

  rl.close();
}

main();
