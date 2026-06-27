import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Collect all HTML files for multi-page build (recursive)
function findHtmlFiles(dir, baseDir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const relPath = path.relative(baseDir, fullPath);
      const name = relPath.replace(/\\/g, '/').replace('.html', '');
      results.push({ name, fullPath });
    }
  }
  return results;
}

function getHtmlInputs() {
  const inputs = {
    main: path.resolve(__dirname, 'index.html'),
    archive: path.resolve(__dirname, 'archive.html'),
  };

  const postsHtmlDir = path.resolve(__dirname, 'posts-html');
  if (fs.existsSync(postsHtmlDir)) {
    const files = findHtmlFiles(postsHtmlDir, postsHtmlDir);
    for (const { name, fullPath: fp } of files) {
      inputs[`posts/${name}`] = fp;
    }
  }

  return inputs;
}

export default defineConfig({
  server: {
    host: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: getHtmlInputs(),
    },
  },
  publicDir: 'public',
});
