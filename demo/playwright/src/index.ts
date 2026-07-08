import { resolve } from 'node:path';
import { loadConfigFromEnv, DEFAULT_URL, DEFAULT_OUTPUT_DIR, MOBILE_PRESET } from './config.js';
import { takeScreenshot, closeBrowser } from './screenshot.js';

interface CliArgs {
  url: string;
  output: string;
  full: boolean;
  mobile: boolean;
  width?: number;
  height?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  timeout?: number;
  userAgent?: string;
  cookies?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    url: DEFAULT_URL,
    output: '',
    full: false,
    mobile: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--url':
        args.url = argv[++i] ?? args.url;
        break;
      case '--output':
      case '-o':
        args.output = argv[++i] ?? args.output;
        break;
      case '--full':
        args.full = true;
        break;
      case '--mobile':
        args.mobile = true;
        break;
      case '--width':
        args.width = Number(argv[++i]);
        break;
      case '--height':
        args.height = Number(argv[++i]);
        break;
      case '--wait-until':
        args.waitUntil = argv[++i] as CliArgs['waitUntil'];
        break;
      case '--timeout':
        args.timeout = Number(argv[++i]);
        break;
      case '--user-agent':
      case '--ua':
        args.userAgent = argv[++i] ?? args.userAgent;
        break;
      case '--cookies':
        args.cookies = argv[++i] ?? args.cookies;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  if (!args.output) {
    const safeName = args.url.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
    args.output = resolve(DEFAULT_OUTPUT_DIR, `${safeName || 'screenshot'}.png`);
  } else {
    args.output = resolve(args.output);
  }

  return args;
}

function printHelp(): void {
  console.log(`Playwright 截图工具

用法:
  pnpm shot --url <url> [options]

选项:
  --url <url>          目标地址（默认读取 .env 的 SCREENSHOT_URL）
  -o, --output <path>  输出文件路径（默认 screenshots/<域名>.png）
  --full               截取完整页面（截图前会滚动触发懒加载）
  --mobile             使用移动端预设视口（390×844, DPR 2），适合手机 H5 活动页
  --width <px>         视口宽度（默认 1280）
  --height <px>        视口高度（默认 800）
  --wait-until <mode>  load | domcontentloaded | networkidle | commit（默认 networkidle）
  --timeout <ms>       超时时间（默认 30000）
  --user-agent <ua>    自定义 User-Agent（默认不设置）
  --cookies <str>      Cookies：JSON 数组 或 name=value; name2=value2（默认不设置）
  -h, --help           显示帮助
`);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const env = loadConfigFromEnv();

  // --mobile 预设优先级最高，其次命令行 --width/--height，最后取 env/默认值
  const preset = cli.mobile ? MOBILE_PRESET : null;
  const width = cli.width ?? preset?.width ?? env.width;
  const height = cli.height ?? preset?.height ?? env.height;
  const dpr = cli.mobile ? preset!.deviceScaleFactor : env.deviceScaleFactor;

  const output = await takeScreenshot({
    url: cli.url,
    output: cli.output,
    fullPage: cli.full || env.fullPage,
    width,
    height,
    waitUntil: cli.waitUntil ?? env.waitUntil,
    timeout: cli.timeout ?? env.timeout,
    deviceScaleFactor: dpr,
    userAgent: cli.userAgent ?? env.userAgent,
    cookies: cli.cookies ?? env.cookies,
  });

  console.log(`✅ 截图已保存: ${output}`);
}

main()
  .catch((err) => {
    console.error('❌ 截图失败:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeBrowser();
  });
