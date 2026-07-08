# 动态技能包 + 沙盒（进阶）

把 Skill 从「写死的元数据」升级为**真实世界形态**（所有 demo 现已统一用动态加载器 `src/skillLoader.ts`，不再有手写注册表）：

- 一个技能 = 一个**文件夹** `skills/<name>/`，里面有 `skill.md`（指令/SOP + 元数据）和**可执行脚本** `run.js` / `run.py`
- 运行时**动态扫描目录**加载技能（不硬编码注册表）
- LLM 选技能 → 注入 SOP → 调用技能携带的脚本 → **脚本在沙盒里执行** → 结果回传

对应 `npm run sandbox`（`src/skillSandboxAgent.ts`）。

---

## 1. 目录结构

```
langChain_ts_agent/
├─ skills/                         ← 动态扫描的技能包目录
│  └─ text_stats/                  ← 示例技能包
│     ├─ skill.md                  ← 元数据(frontmatter) + SOP(body)
│     ├─ run.js                    ← JS 脚本（被沙盒执行）
│     └─ run.py                    ← Python 脚本（子进程隔离执行）
├─ src/
│  ├─ skillLoader.ts               ← 扫描 skills/ 解析 skill.md → SkillPackage[]
│  ├─ sandbox.ts                   ← 沙盒执行器（核心）
│  ├─ skillSandboxAgent.ts         ← 动态加载 + 路由 + 注入 + Tool 调沙盒
│  └─ ...（现有文件不动）
└─ package.json                    ← "sandbox": "tsx src/skillSandboxAgent.ts"
```

**「动态注入」的核心**：新增一个技能 = 往 `skills/` 丢一个文件夹，重启（或 `/reload`）即生效，无需改任何代码。运行时注册表来自 `loadSkillsFromDir()` 的磁盘扫描结果。

---

## 2. 技能包格式：`skills/text_stats/skill.md`

采用 **YAML frontmatter + Markdown 正文**（与 Anthropic/Claude 的 skill 仓库同款风格），解析器零依赖：

```markdown
---
name: text-stats
description: 当用户需要统计文本字数、词频、字符数等真实数据时
entry: run.js
runtime: node          # node | python
---

你是文本统计专家。当用户要统计文本时，调用工具 `run_skill_script`
并传入用户的原始文本；……返回的是**唯一权威结果**，必须原样引用。
```

- **frontmatter** 只放机器要的字段：`name` / `description`（给路由器选）、`entry`（脚本文件名，**可选**）、`runtime`（node | python）
- **正文** 是给 LLM 看的 SOP，运行时注入 system prompt
- **纯指令型技能**：不带脚本时，`entry` 省略即可（如 `say-hello`）。这类技能只会把 SOP 注入 prompt，不会调用沙盒；`yarn sandbox` 也不会给它附加 `run_skill_script` 调用指令。

脚本约定（JS）：
```js
module.exports = function run(input) {
  // input 为传入的原始文本
  return JSON.stringify({ /* 任意结果 */ });
};
```
Python 约定：从 stdin 读一行 JSON，把结果 JSON 写到 stdout（`run.py`）。

---

## 3. 沙盒设计（你最想搞懂的部分）

### 两层隔离叠加

```
不可信脚本
  └─ 子进程 (execFile)        ← ① 防「跑飞」：timeout 强杀 / maxBuffer 限流
       └─ node:vm (仅 JS)     ← ② 防「碰宿主」：剥夺 fs/process/require
```

| 技术 | 能挡什么 | 挡不了什么 |
|---|---|---|
| `node:vm`（命名空间隔离） | 脚本拿不到 `fs`/`process`/`require` 等宿主对象 | **同步死循环会卡死**（无法超时中断） |
| 子进程（`execFile`） | **wall-clock 超时 kill**、`maxBuffer` 限制输出、最小 `env` | 需自己写主机壳 / 生产再上容器 |

> 一句话：**`vm` 解决「不让代码碰宿主」，子进程解决「代码跑飞了能杀掉」**。两者结合才是合格沙盒。

### JS 路径：`子进程 + vm`

- 主进程 `execFile(process.execPath, [runner.cjs, codePath], { timeout, maxBuffer, env:{} })`
- `runner.cjs` 是**可信宿主代码**，它在子进程里再用 `vm.createContext` 构造**只含安全对象**的沙盒（`Math/JSON/Date/console`，**无** `fs/process/require/global`），然后 `vm.runInContext(skillCode)`
- 子进程超时（默认 3000ms）直接 `SIGTERM` 强杀 → 同步死循环被兜底干掉
- 输入经 stdin 传 JSON；脚本 `module.exports` 的函数返回值写回 stdout

### Python 路径：只能子进程

`node:vm` 管不到 Python 解释器，因此 Python 技能**只走子进程**：
```ts
execFile("python3", [scriptPath], { timeout, maxBuffer, env: {} })
```
stdin 传参、stdout 收结果；找不到 `python3` 时自动回退到 `python`。生产环境 Python 应进一步放进 Docker / seccomp 隔离。

### 安全默认值（集中在 `src/sandbox.ts` 顶部）

- `SANDBOX_TIMEOUT_MS = 3000` —— 超时强杀，防 DoS 的关键
- `SANDBOX_MAX_BUFFER = 1MB` —— 防输出洪水
- 注入脚本的上下文**只有**输入参数 + 受限内置对象，**无** `require/fs/process`
- `env: {}` —— 最小环境变量，避免泄漏宿主机密

---

## 4. 闭环（大脑 / 四肢 分工）

```mermaid
flowchart TD
    A[启动: loadSkillsFromDir 扫描 skills/] --> B[动态注册表 SkillPackage[]]
    U[👤 用户输入] --> R["🧠 大脑(LLM) 路由选技能"]
    R --> I["🦿 四肢: 注入 skill.md 正文到 system prompt"]
    I --> T{LLM 调用 run_skill_script?}
    T -->|是| S["🦿 沙盒: 子进程 + vm\n限时/限内存/无危险全局"]
    S -->|输出| T
    T -->|否| O[🤖 输出]
    S --> O
```

- **软约束（SOP）**：`skill.md` 正文注入 prompt，LLM *概率性*遵循
- **硬约束（脚本）**：真实计算在沙盒里发生，不跑就报错 / 被拦截 → 结果唯一权威

这正是「Skill 软、Sandbox 硬」：方法靠注入引导，数据靠沙盒保证。

---

## 5. 恶意脚本被沙盒拦下的对照

沙盒的两个能力可直接体验：

**(a) 碰宿主被拒**（在 `run.js` 里写 `fs.readFileSync("/etc/passwd")`）
→ `vm` 上下文没有 `fs` → `ReferenceError` → 子进程退出码 2 → 工具返回 `[沙盒执行失败]`。

**(b) 同步死循环被强杀**（在 `run.js` 里写 `while(true){}`）
→ `vm` 拦不住，但子进程 3000ms 超时 → `SIGTERM` 强杀 → 工具返回 `[沙盒拦截] 脚本执行超过 3000ms……`。

想本地验证 (b)，可在 `skills/` 下临时新建一个技能，把 `run.js` 写成：
```js
module.exports = function run() { while (true) {} }
```
然后 `npm run sandbox`，对它提问触发调用，观察超时强杀日志；验证完删除该文件夹即可（**不要提交恶意脚本**）。

---

## 6. 如何新增一个技能

1. 在 `skills/` 下新建目录，如 `skills/my_skill/`
2. 写 `skill.md`：`name` / `description` / `entry` / `runtime` + 正文 SOP
3. 写 `run.js`（或 `run.py`），导出 `function run(input){...}`
4. 重启或输入 `/reload` → 动态注册，无需改动任何源码

---

## 7. 局限与下一步（生产化）

当前实现是**最小可演示**版本，已覆盖「动态注入 + 双层沙盒」的教学目标。生产环境还需：

- **文件系统/网络/系统调用**：Docker（非 root 用户）+ seccomp / gVisor 进一步收敛
- **资源配额**：cgroup 限制 CPU/内存，避免慢速内存泄漏型 DoS
- **隔离粒度**：每技能独立容器池、预热复用，降低冷启动
- **审计**：记录每次沙盒调用的技能名、耗时、输出大小
- **Python 风险**：本实现仅靠子进程隔离，未限制其系统调用，务必容器化后再跑不可信 Python

> 关键认知：**沙盒没有银弹**。`vm` 与子进程只是「够用的第一层」，真正的强隔离来自操作系统级边界（容器 / 微服务 / WASM）。
