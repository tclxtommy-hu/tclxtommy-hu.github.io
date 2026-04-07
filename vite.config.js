import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Collect all HTML files for multi-page build
function getHtmlInputs() {
  const inputs = { main: path.resolve(__dirname, 'index.html') };

  const postsHtmlDir = path.resolve(__dirname, 'posts-html');
  if (fs.existsSync(postsHtmlDir)) {
    const files = fs.readdirSync(postsHtmlDir).filter(f => f.endsWith('.html'));
    for (const file of files) {
      const name = file.replace('.html', '');
      inputs[`posts/${name}`] = path.resolve(postsHtmlDir, file);
    }
  }

  return inputs;
}

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: getHtmlInputs(),
    },
  },
  publicDir: 'public',
});
