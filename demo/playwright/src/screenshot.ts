import { chromium, type Browser, type Cookie } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ScreenshotOptions } from './config.js';

let sharedBrowser: Browser | null = null;

/**
 * 解析 Cookies 输入串，支持两种格式：
 * 1) JSON 数组：[{"name":"x","value":"y","domain":".a.com","path":"/"}, ...]
 * 2) 简单格式：name1=value1; name2=value2（domain 取目标 URL 主机名）
 *
 * @returns 解析后的 Cookie 数组；无法解析时返回空数组
 */
export function parseCookiesInput(raw: string, url: string): Cookie[] {
  const trimmed = raw.trim();

  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr as Cookie[];
    } catch {
      // 不是合法 JSON，继续按简单格式解析
    }
  }

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // URL 非法时 domain 留空，交由 Playwright 校验
  }

  return trimmed
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=');
      const name = idx === -1 ? pair : pair.slice(0, idx);
      const value = idx === -1 ? '' : pair.slice(idx + 1);
      return { name, value, domain: host, path: '/' } as Cookie;
    });
}

/**
 * 获取（并复用）一个 chromium 浏览器实例。
 */
export async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch();
  }
  return sharedBrowser;
}

/**
 * 关闭复用的浏览器实例（程序退出前调用）。
 */
export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

/**
 * 对单个 URL 进行截图。
 *
 * @returns 截图文件保存的绝对路径
 */
export async function takeScreenshot(opts: ScreenshotOptions): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.deviceScaleFactor,
    userAgent: opts.userAgent,
  });

  try {
    page.setDefaultTimeout(opts.timeout);

    if (opts.cookies) {
      const cookies = parseCookiesInput(opts.cookies, opts.url);
      if (cookies.length) await page.context().addCookies(cookies);
    }

    await page.goto(opts.url, { waitUntil: opts.waitUntil, timeout: opts.timeout });

    // 全页截图前先滚动到底部，触发懒加载图片/异步内容渲染，
    // 否则只截到首屏（未加载区块高度为 0，看起来「只有一部分」）。
    if (opts.fullPage) {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let y = 0;
          const timer = setInterval(() => {
            window.scrollTo(0, y);
            y += 400;
            if (y >= document.documentElement.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 80);
        });
      });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    await mkdir(dirname(opts.output), { recursive: true });
    await page.screenshot({
      path: opts.output,
      fullPage: opts.fullPage,
    });

    return opts.output;
  } finally {
    await page.close();
  }
}
