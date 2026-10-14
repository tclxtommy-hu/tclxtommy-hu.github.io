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
  // 本地开发：把聊天请求转发给 BFF（../tclxtommy-hu.github.io.bff，默认 8788），
  // 浏览器看到的是同源请求，不需要 HTTPS 也不需要 CORS 白名单。
  server: {
    host: true,
    proxy: {
      // 目标只写到「主机:端口」，路径由 vite 原样转发（写全路径会变成 /api/chat/api/chat）
      // 127.0.0.1:8788 = 本机的 BFF；想连服务器上的，先开 SSH 隧道：ssh -L 8788:127.0.0.1:8788 root@<ECS公网IP>
      '/api/chat': 'https://token666.cn/chat',
      '/api/health': 'https://token666.cn/chat',
    },
  },
  // `npm run build && npm run preview` 时同样代理，方便本地验证生产构建
  preview: {
    proxy: {
      '/api/chat': 'https://token666.cn/chat',
      '/api/health': 'https://token666.cn/chat',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: getHtmlInputs(),
    },
  },
  publicDir: 'public',
});
