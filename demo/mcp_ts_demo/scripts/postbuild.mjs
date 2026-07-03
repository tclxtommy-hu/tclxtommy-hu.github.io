/**
 * postbuild - .js → .mjs 重命名 + 修复 import + shebang
 */
import { readFileSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist";
const SHEBANG = "#!/usr/bin/env node\n";
const BIN_FILES = ["stdio.mjs"];

// 1. 重命名
for (const file of readdirSync(DIST)) {
  const full = join(DIST, file);
  if (file.endsWith(".js.map")) renameSync(full, join(DIST, file.replace(/\.js\.map$/, ".mjs.map")));
  else if (file.endsWith(".js") && !file.endsWith(".mjs")) renameSync(full, join(DIST, file.replace(/\.js$/, ".mjs")));
}

// 2. 修复 import
for (const file of readdirSync(DIST).filter(f => extname(f) === ".mjs")) {
  const full = join(DIST, file);
  let content = readFileSync(full, "utf8");
  content = content.replace(/(from\s+["'])\.\/(\w+)\.js(["'])/g, "$1./$2.mjs$3");
  writeFileSync(full, content);
  console.log(`  ✓ fix imports -> ${file}`);
}

// 3. shebang
for (const file of BIN_FILES) {
  const full = join(DIST, file);
  let content = readFileSync(full, "utf8");
  if (!content.startsWith("#!")) {
    writeFileSync(full, SHEBANG + content);
    console.log(`  ✓ shebang   -> ${file}`);
  }
}
console.log("  postbuild done.");
