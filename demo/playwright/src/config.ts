import { config } from 'dotenv';

config();

export interface ScreenshotOptions {
  /** 目标 URL */
  url: string;
  /** 输出文件路径（含扩展名，如 .png） */
  output: string;
  /** 是否截取完整页面 */
  fullPage: boolean;
  /** 视口宽度 */
  width: number;
  /** 视口高度 */
  height: number;
  /** 等待策略 */
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  /** 超时时间（毫秒） */
  timeout: number;
  /** 设备缩放因子（DPR） */
  deviceScaleFactor: number;
  /** 自定义 User-Agent（默认不设置） */
  userAgent?: string;
  /** 自定义 Cookies 原始串（JSON 数组 或 name=value; 格式，默认不设置） */
  cookies?: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 从环境变量读取默认配置。
 */
export function loadConfigFromEnv(): Omit<ScreenshotOptions, 'url' | 'output'> {
  return {
    fullPage: bool(process.env.FULL_PAGE, false),
    width: num(process.env.VIEWPORT_WIDTH, 1280),
    height: num(process.env.VIEWPORT_HEIGHT, 800),
    waitUntil: (process.env.WAIT_UNTIL as ScreenshotOptions['waitUntil']) ?? 'networkidle',
    timeout: num(process.env.TIMEOUT, 30000),
    deviceScaleFactor: num(process.env.DEVICE_SCALE_FACTOR, 1),
    userAgent: process.env.USER_AGENT,
    cookies: process.env.COOKIES,
  };
}

export const DEFAULT_URL = process.env.SCREENSHOT_URL ?? 'https://example.com';
export const DEFAULT_OUTPUT_DIR = process.env.SCREENSHOT_OUTPUT ?? 'screenshots';

/** 移动端预设视口（适配手机 H5 活动页） */
export const MOBILE_PRESET = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
};
