import { execFile, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SkillPackage } from "./skillLoader.js";

/**
 * 沙盒执行器（本项目最核心、也是你最想搞懂的部分）。
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  设计原则：两层隔离叠加                                            │
 * │                                                                    │
 * │  ① 子进程隔离（防「跑飞」）                                        │
 * │     - 脚本在独立进程里跑，主进程用 timeout 强杀、maxBuffer 限流。  │
 * │     - 同步死循环 / 内存爆炸 → 子进程被 kill，主进程不受影响。      │
 * │     - 一句话：子进程负责「代码跑飞了能杀掉」。                     │
 * │                                                                    │
 * │  ② 命名空间隔离（防「碰宿主」）                                    │
 * │     - JS 脚本在子进程内再用 node:vm 执行，context 里只放安全对象。 │
 * │     - 不挂 fs / process / require，脚本拿不到宿主能力。            │
 * │     - 一句话：vm 负责「不让代码碰宿主」。                          │
 * │                                                                    │
 * │  为什么必须两层？                                                  │
 * │    node:vm 本身挡不住「同步死循环」（无法超时中断），              │
 * │    只有子进程的 wall-clock 超时才能强杀 → 二者结合才是合格沙盒。  │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 说明：这是「贴近真实、可演示」的最小实现。生产环境在此基础上还应加
 * Docker / gVisor / seccomp、非 root 用户、cgroup 资源配额等。
 */

/** 沙盒安全默认值（集中在此，便于讲解与调参） */
export const SANDBOX_TIMEOUT_MS = 3000; // 超时强杀：防同步死循环 / DoS
export const SANDBOX_MAX_BUFFER = 1024 * 1024; // 1MB：防输出洪水

export interface SandboxResult {
  ok: boolean;
  output: string;
  error?: string;
  timedOut?: boolean;
}

/**
 * 子进程内执行的 runner（CommonJS，.cjs 扩展名确保不受宿主 package.json
 * 的 type:module 影响）。它在子进程里再用 node:vm 剥夺脚本对宿主对象
 * 的访问。runner 本身是「可信宿主代码」，可以正常 require fs/vm。
 */
const RUNNER_CODE = `
"use strict";
const fs = require("fs");
const vm = require("vm");

// 用流方式读 stdin（fs.readFileSync(0) 在 Windows 管道上不可靠，会读成空）
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

(async () => {
  const codePath = process.argv[2];
  if (!codePath) { process.stderr.write("missing codePath\\n"); process.exit(1); }

  let code;
  try { code = fs.readFileSync(codePath, "utf8"); }
  catch (e) { process.stderr.write("cannot read skill: " + e + "\\n"); process.exit(1); }

  const raw = await readStdin();
  let input = null;
  try { if (raw.trim()) input = JSON.parse(raw); }
  catch (e) { /* 无/非 JSON 输入时按 null 处理 */ }

  // 只暴露安全的内置对象；刻意不挂 fs / process / require / global
  const moduleShim = { exports: {} };
  const sandbox = {
    module: moduleShim,
    exports: moduleShim.exports,
    console: {
      log: (...a) => process.stdout.write(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\\n"),
      error: (...a) => process.stderr.write(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\\n"),
      warn: (...a) => process.stderr.write(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\\n"),
    },
    Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite, Map, Set, Symbol, Proxy, Reflect,
    decodeURIComponent, encodeURIComponent,
    require: () => { throw new Error("[sandbox] require 被禁用"); },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // 注意：node:vm 的 timeout 选项无法中断「同步死循环」（只在安全检查点触发），
  // 所以真正兜底超时由「外层子进程」负责，这里不依赖 vm 的 timeout。
  try { vm.runInContext(code, sandbox, { filename: "skill.js" }); }
  catch (e) { process.stderr.write("[sandbox] 脚本执行错误: " + (e && e.stack ? e.stack : e) + "\\n"); process.exit(2); }

  const fn = moduleShim.exports;
  if (typeof fn !== "function") {
    process.stderr.write("[sandbox] 技能必须 module.exports = function(input){...}\\n");
    process.exit(3);
  }
  let result;
  try { result = fn(input); }
  catch (e) { process.stderr.write("[sandbox] 运行时错误: " + (e && e.stack ? e.stack : e) + "\\n"); process.exit(2); }
  process.stdout.write(typeof result === "string" ? result : JSON.stringify(result));
})();
`;

let runnerPath: string | null = null;
function getRunnerPath(): string {
  if (runnerPath) return runnerPath;
  runnerPath = path.join(os.tmpdir(), `sandbox-runner-${process.pid}.cjs`);
  fs.writeFileSync(runnerPath, RUNNER_CODE, "utf8");
  return runnerPath;
}

function pipeInput(child: ChildProcess, input: unknown) {
  // 始终 JSON 序列化：runner 端用 JSON.parse 还原，
  // 这样字符串参数也会带上引号，反序列化后仍是字符串。
  child.stdin?.write(JSON.stringify(input));
  child.stdin?.end();
}

/** JS 技能：子进程(node) + vm 双层隔离 */
function runJsInSandbox(codePath: string, input: unknown): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [getRunnerPath(), codePath],
      { timeout: SANDBOX_TIMEOUT_MS, maxBuffer: SANDBOX_MAX_BUFFER, env: {}, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const timedOut = err.killed || (err as NodeJS.ErrnoException).code === "ETIMEDOUT";
          return resolve({
            ok: false,
            output: stdout.toString(),
            error: stderr.toString() || err.message,
            timedOut,
          });
        }
        resolve({ ok: true, output: stdout.toString() });
      }
    );
    pipeInput(child, input);
  });
}

/**
 * Python 技能：只能走子进程隔离（node:vm 管不到 Python 解释器）。
 * 靠 execFile 的 timeout / maxBuffer / env 隔离；生产再上容器化。
 */
function runPyInSandbox(scriptPath: string, input: unknown): Promise<SandboxResult> {
  const candidates =
    process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

  const tryRun = (i: number): Promise<SandboxResult> => {
    if (i >= candidates.length) {
      return Promise.resolve({
        ok: false,
        output: "",
        error: `未找到 python 解释器（已尝试 ${candidates.join(", ")}）`,
      });
    }
    return new Promise((resolve) => {
      const child = execFile(
        candidates[i],
        [scriptPath],
        { timeout: SANDBOX_TIMEOUT_MS, maxBuffer: SANDBOX_MAX_BUFFER, env: {} },
        (err, stdout, stderr) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ENOENT") {
              resolve(tryRun(i + 1)); // 试下一个候选解释器名
              return;
            }
            const timedOut = err.killed || code === "ETIMEDOUT";
            return resolve({
              ok: false,
              output: stdout.toString(),
              error: stderr.toString() || err.message,
              timedOut,
            });
          }
          resolve({ ok: true, output: stdout.toString() });
        }
      );
      pipeInput(child, input);
    });
  };
  return tryRun(0);
}

/** 按技能的 runtime 分发到对应沙盒执行器 */
export function runSkillScript(skill: SkillPackage, input: unknown): Promise<SandboxResult> {
  // 纯指令型技能（entry 为空）：没有可执行的脚本，仅用于 SOP 注入
  if (!skill.entry) {
    return Promise.resolve({
      ok: false,
      output: "",
      error: "该技能是纯指令型，没有关联可执行脚本（entry 为空）",
    });
  }
  const entryPath = path.join(skill.dir, skill.entry);
  if (!fs.existsSync(entryPath)) {
    return Promise.resolve({ ok: false, output: "", error: `找不到技能脚本：${entryPath}` });
  }
  return skill.runtime === "python"
    ? runPyInSandbox(entryPath, input)
    : runJsInSandbox(entryPath, input);
}
