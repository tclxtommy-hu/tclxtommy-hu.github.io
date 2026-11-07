# Agent 运行主机与沙箱

> 最后修改时间：2026-11-07 14:00

> 状态：✅ 已补齐（2026-11-07）  
> 一句话定义：Agent 需要 **专用执行环境** （主机 / 虚拟机 / 沙箱）来收口爆炸半径、匹配突发资源画像并支持分钟级重置；本篇讲工程师怎么选型、怎么调度、怎么算成本、怎么画安全边界。

## 大纲

1. [为什么 Agent 不能直接跑在普通 Web 服务的宿主机上](#一为什么-agent-不能直接跑在普通-web-服务的宿主机上)
2. [执行环境谱系与选型对比](#二执行环境谱系与选型对比)
3. [Agent 主机的资源画像与调度](#三agent-主机的资源画像与调度)
4. [安全边界：网络、凭据、文件系统与审计](#四安全边界网络凭据文件系统与审计)
5. [Coding Agent 的云端主机形态](#五coding-agent-的云端主机形态)
6. [成本与容量规划](#六成本与容量规划)
7. [端到端落地示例：四周迭代](#七端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [sandbox 沙箱](../../Harness/sandbox沙箱.html)——仓库已有沙箱机制深挖：隔离维度、Workspace 七种后端、各家 Harness 实践对照。**分工**：它讲「沙箱是什么、隔离哪几层、各家怎么落地」；本篇站在 AI 工程师的部署视角，讲 **主机形态、容量调度、成本与安全边界** ，两篇互补不重叠。
- [多租户与隔离](08-多租户与隔离.html)——同分区前一篇。**分工**：它讲 **数据与配额** 的租户隔离（向量库过滤、租户限流、日志脱敏）；本篇讲 **执行环境本身** 的隔离（VM / 沙箱形态、资源画像、镜像与凭据），一个管「数据是谁的」，一个管「代码在哪跑」。
- [Computer Use](../07-前沿与形态/02-Computer-Use.html)——远程桌面 VM 场景的模型侧交互，本篇只讲它的宿主形态（第五节一处交叉引用）。
- [限流、重试与幂等](06-限流重试与幂等.html)——任务级并发控制的通用手法，本篇的池化调度直接复用其思路。

## 学习要点（读后应能回答）

- Web 服务和 Agent 任务的资源画像差在哪？为什么共用宿主机会出事？→ 见 [1.2](#12-web-服务与-agent-任务的资源画像对比)
- 六档执行环境怎么选？启动时间和隔离强度的取舍是什么？→ 见 [2.2](#22-六档执行环境对比表)
- 快照恢复为什么能做到亚秒级？池命中率怎么提？→ 见 [3.2](#32-快照恢复与预热池)
- 凭据为什么绝不打进镜像？出站白名单怎么收口？→ 见 [四](#四安全边界网络凭据文件系统与审计)
- 每天评审 40 个 PR，一年要花多少钱？→ 见 [6.3](#63-月成本测算)

---

## 一、为什么 Agent 不能直接跑在普通 Web 服务的宿主机上

### 1.1 爆炸半径：模型会动手

**爆炸半径** /blæst ˈreɪdiəs/ （blast radius，故障可波及的最大范围）是本篇第一关键词。普通 Web 服务的代码是人写的、经过评审、行为可预测；Agent 的宿主机上跑的命令是 **模型现场生成的**——它会执行 shell、装依赖、改文件、调外部接口，其中任何一条都可能出错或被提示注入劫持。

小北的第一次翻车就发生在这：他把代码评审 Agent 直接部署在公司一台跑网关服务的宿主机上（「反正就是个 Python 脚本」）。某次评审一个 Rust 项目时，Agent 执行了 `cargo build --release`，编译把 16 核 CPU 全部打满 11 分钟——同机的网关服务 p99 延迟从 82ms 飙到 2.3s，触发上游超时重试雪崩。事故不大，但结论清晰：

> **Agent 的失败模式不是「返回错误」，而是「执行了不该执行的副作用」。** 与其约束它别犯错，不如让它犯错时炸不出那一小块地盘。

### 1.2 Web 服务与 Agent 任务的资源画像对比

| 维度 | 普通 Web 服务 | Agent 任务 | 冲突点 |
|------|--------------|-----------|--------|
| CPU 曲线 | 平稳，微突发 | **编译 / 测试期突发打满** ，其余时间近乎为零 | 共享宿主机互相拖垮（小北事故） |
| 单任务时长 | 毫秒级请求 | **分钟到小时级** （18 分钟很常见） | 占着进程不放，连接池 / 内存全被拖长 |
| 状态 | 无状态 + 外部存储 | 工作区有大量本地文件（clone、构建产物） | 横向扩容困难，重启丢上下文 |
| 失败处理 | 重试即可 | 副作用可能已发生（写了文件、发了请求） | 需要 **可重置** ：整个环境扔掉重来 |
| 镜像依赖 | 运行时轻量 | 需要 **编译工具链、浏览器、SDK 全家桶** | 镜像数 GB，和 Web 服务完全不是一类 |
| 安全边界 | 输入校验即可 | 模型生成的代码 = 不可信代码 | 必须当「运行用户提交代码」对待 |

核心矛盾是最后两行：Agent 宿主机本质上是一台 **「跑不可信代码的临时工作站」** ，而 Web 宿主机是「跑可信代码的长期服务员」。这两类负载从云厂商的角度就该分池部署。

**落地示例**：把「任务必须可重置」写成接口约定（Node.js + TS）：

```typescript
/** Agent 任务的执行环境契约：任何实现都必须满足「可丢弃」 */
interface AgentWorkspace {
  /** 环境内产生的所有副作用（文件、进程、网络状态）都限于本环境 */
  readonly scope: "vm" | "container" | "process";
  /** 重置：把环境恢复到「刚创建」状态，用于任务失败重试 */
  reset(): Promise<void>;
  /** 销毁：彻底回收，用于任务结束或超时 */
  destroy(): Promise<void>;
  /** 健康检查：环境内进程失控（OOM、fork 炸弹）时由调度方强制销毁 */
  isHealthy(): Promise<boolean>;
}
```

只要宿主机上所有 Agent 负载都实现这个契约，「重试 = 新环境」就有了工程保证，而不是祈祷上一个任务没留下脏东西。

---

## 二、执行环境谱系与选型对比

### 2.1 六档谱系

**Sandbox** /ˈsændbɒks/ （沙箱）不是单一技术，是一条从弱到强的谱系。沙箱的机制细节（namespace、seccomp、各家 Harness 的实现对照）见 [sandbox 沙箱](../../Harness/sandbox沙箱.html)，本节只回答 **选型问题** ：

```text
进程内执行 → Docker 容器 → gVisor/Kata 加固容器 → Firecracker microVM → 云端托管沙箱 → 远程桌面 VM
（最轻、最快、最不安全 ——————————————————————————————→ 最强、最慢、最贵）
```

### 2.2 六档执行环境对比表

| 档位 | 启动时间 | 隔离强度 | 可快照 | 成本量级 | 适合的 Agent 形态 |
|------|---------|---------|--------|---------|------------------|
| **进程内执行**（子进程 + 超时） | <100ms | ★ 弱：共享文件系统与网络，能读到宿主所有文件 | 不可 | 零 | 跑模型生成的 **纯计算片段** （算个斐波那契），绝不能跑 shell |
| **Docker 容器** | 冷 1–3s（镜像已在本机） | ★★★ 中：文件 / 进程 / 网络隔离，但 **共享宿主内核** | 难（需 commit 镜像） | 低 | 单租户、可信度较高的内部 Agent，自建起步首选 |
| **gVisor / Kata 加固容器** | gVisor 冷 2–5s（行业常见量级）；Kata 5–15s | ★★★★ 较强：gVisor 用户态内核拦截 syscall；Kata 独立轻 VM 内核 | gVisor 难；Kata 可 | 低–中 | 多租户但想复用 K8s 体系的团队 |
| **Firecracker microVM** | 冷启动 ~125ms（官方公开口径，裸 boot）；**整机就绪含 agent ~3–8s** ；**快照恢复亚秒级** | ★★★★★ 强：独立内核，无共享内核逃逸面 | **可**（内存快照是核心竞争力） | 中（宿主机整机摊销） | 多租户生产、Coding Agent 主力形态 |
| **云端托管沙箱**（E2B / Daytona / Modal 类） | 0.3–3s（行业常见量级，各家差异大） | ★★★★★ 强（底层多为 Firecracker） | 可（暂停 / 恢复） | 按量计费，单价高于自建 | 快速上线、流量波动大、无专职运维 |
| **远程桌面 VM**（Computer Use 场景） | 30s–2min | ★★★★ 较强 | 可（磁盘镜像） | 高（GPU + 桌面环境常驻） | 需要完整 GUI 操作（浏览器点页面、用桌面软件）的任务 |

三档「中间层」的取舍逻辑值得展开：**gVisor 用性能换安全**（syscall 被用户态重放，重 IO 负载损耗可达两位数百分比，行业常见量级）；**Kata 用启动时间换兼容性**（标准容器接口 + VM 隔离）；**Firecracker 用运维复杂度换两者兼得**（自建要管宿主机池、快照分发、内核升级）。

### 2.3 选型决策：三个问题定档位

**落地示例**：选型决策函数（Node.js + TS），小北团队的真实决策逻辑：

```typescript
type Tier = "inProcess" | "container" | "hardenedContainer" | "microVM" | "managedSandbox" | "desktopVM";

interface SelectionInput {
  untrustedCode: boolean;      // 是否执行模型生成的任意代码 / shell
  multiTenant: boolean;        // 是否多租户（含「别家员工的数据」）
  needsSnapshot: boolean;      // 是否需要亚秒级就绪（任务频繁 / 会话粘性要求高）
  needsGUI: boolean;           // 是否要操作完整桌面
  hasInfraTeam: boolean;       // 有没有人管宿主机池与内核升级
}

export function selectTier(input: SelectionInput): Tier {
  if (input.needsGUI) return "desktopVM";                       // GUI 只有这一档能干
  if (!input.untrustedCode && !input.multiTenant) {
    return "container";                                          // 内部可信负载，容器够用
  }
  if (!input.hasInfraTeam) return "managedSandbox";              // 没人运维就别自建 microVM 池
  if (input.needsSnapshot) return "microVM";                     // 高频短任务，快照是刚需
  return "hardenedContainer";                                    // 已有 K8s 且启动不敏感
}
```

小北团队当时的输入是 `{ untrustedCode: true, multiTenant: true, needsSnapshot: true, needsGUI: false, hasInfraTeam: true }`，输出 `microVM`——但这是 **四周迭代之后** 的结论，第一周他们先用托管沙箱上线（见 [七](#七端到端落地示例四周迭代)）。

---

## 三、Agent 主机的资源画像与调度

### 3.1 镜像预装：把「等依赖」消灭在镜像里

Agent 任务最贵的不是算力，是 **冷启动时装依赖** 。小北实测过一个反面案例：每任务临时 `npm install` + `pip install`，平均 6 分 12 秒——比评审本身的分析步骤还久。解法是把这些固化进基础镜像：

| 预装内容 | 代表组件 | 为什么必须预装 |
|---------|---------|---------------|
| 语言运行时 | Node 20 / Python 3.12 / Go 1.22 | 覆盖目标仓库 95% 的技术栈 |
| 包管理器 | pnpm / uv / cargo | 版本锁死，避免 registry 变动导致任务不可复现 |
| 编译工具链 | gcc、make、cmake | `npm install` 遇到 native addon 时不再抓瞎 |
| 浏览器 | headless Chrome | 评审前端 PR 时截图 / 跑 E2E |
| 常用 CLI | git、gh、ripgrep、jq | Agent 最常调用的工具，缺一个就是一轮报错重试 |
| Agent 运行时 | 评审 Agent 本体 + 依赖 | 随镜像分发，快照里也包含它 |

镜像 1.8 GB（小北实测口径），分层构建：底层系统层（季度更新）→ 工具链层（月度更新）→ Agent 层（随版本发布）。**层次越靠上变动越频繁**，这样宿主机上大部分缓存层可以复用，镜像更新只拉增量。

### 3.2 快照恢复与预热池

这是 microVM 档的核心竞争力。两种就绪方式的差别：

```text
冷启动路径（3–8s，实测口径 7.4s）：
  创建 VM → boot 内核 → 挂载镜像 → 启动 agent 进程 → 就绪

快照恢复路径（亚秒级，实测口径 620ms）：
  创建 VM → 从内存快照恢复（内核 + agent 已在内存里）→ 就绪
```

快照的原理是：先启动一台 VM 让 agent 进程完全就绪，然后 `pause` 并把整台 VM 的内存 dump 成快照文件分发到各宿主机。之后每次「启动」只是 **恢复内存映像** ，跳过 boot 和进程初始化。Firecracker 官方文档给出的快照恢复延迟是数百毫秒量级，小北在自己的宿主机上实测 620ms（实测口径，2 vCPU / 2 GB 规格）。

**落地示例**：VM 池管理器（Node.js + TS），这是整个主机的调度中枢：

```typescript
interface VMSpec { vcpu: number; memoryMB: number }
interface VMHandle {
  id: string;
  hostId: string;
  acquiredAt: number;
  taskId?: string;                    // 会话粘性：当前绑定的任务
}

interface PoolConfig {
  warmSize: number;                   // 预热池目标水位（已恢复快照、待命）
  maxConcurrent: number;              // 弹性上限
  stickyTTLms: number;                // 粘性保活窗口：任务结束后保留多久供复用
}

export class VMPool {
  private warm: VMHandle[] = [];      // 已恢复快照，随时可交付
  private busy = new Map<string, VMHandle>();
  private idleTimers = new Map<string, NodeJS.Timeout>();

  constructor(private cfg: PoolConfig, private spec: VMSpec) {}

  /** 取 VM：优先会话粘性 → 预热池 → 冷创建 */
  async acquire(taskId: string, stickyKey?: string): Promise<VMHandle> {
    // 1. 会话粘性（sticky /ˈstɪki/）：同一任务（如 PR 追加了 commit）复用原 VM
    if (stickyKey) {
      const sticky = this.busy.get(`sticky:${stickyKey}`);
      if (sticky) { clearTimeout(this.idleTimers.get(sticky.id)); return sticky; }
    }
    // 2. 预热池弹出，同时异步补水位
    const vm = this.warm.pop() ?? await this.createAndRestoreSnapshot(this.spec);
    this.refillWarm();
    vm.taskId = taskId;
    this.busy.set(taskId, vm);
    return vm;
  }

  /** 还 VM：有粘性键则保活计时，否则直接销毁 */
  release(taskId: string, stickyKey?: string): void {
    const vm = this.busy.get(taskId);
    if (!vm) return;
    this.busy.delete(taskId);
    if (stickyKey) {
      this.busy.set(`sticky:${stickyKey}`, vm);
      this.idleTimers.set(vm.id, setTimeout(() => {
        void this.destroy(vm);                        // 粘性 TTL 到期，空闲回收
        this.busy.delete(`sticky:${stickyKey}`);
      }, this.cfg.stickyTTLms));
    } else {
      void this.destroy(vm);
    }
    this.refillWarm();
  }

  private refillWarm(): void {
    while (this.warm.length < this.cfg.warmSize &&
           this.warm.length + this.busy.size < this.cfg.maxConcurrent) {
      void this.createAndRestoreSnapshot(this.spec).then((vm) => this.warm.push(vm));
    }
  }

  private async createAndRestoreSnapshot(spec: VMSpec): Promise<VMHandle> { /* 调宿主机 hypervisor */ }
  private async destroy(vm: VMHandle): Promise<void> { /* 释放磁盘与内存 */ }
}
```

小北的配置：`warmSize: 4, maxConcurrent: 16, stickyTTLms: 600_000`（10 分钟保活，覆盖「PR 追加 commit 再评一次」的场景）。上线后池命中率 92%——92% 的任务拿到的是 **已恢复好快照** 的 VM，只有 8% 等待快照恢复，无一冷启动。

### 3.3 会话粘性到底值不值

粘性保活不是免费的：任务结束后 VM 多占 10 分钟资源。小北算过这笔账（数字在 [6.1](#61-单-vm-时租账) 复用）：

- 追加 commit 的 PR 占比 30%；
- 粘性命中后省下一次 clone + 装依赖（约 90 秒）+ 上下文重建；
- 保活期望成本 = 10 min × 30% = 3 min/任务；
- VM 有效利用率 = 18 / (18 + 3) ≈ **86%** 。

结论：**粘性键只发给「很可能追加工作」的任务类型** （PR 评审、长对话任务），一次性任务（跑测试、格式化）绝不保活。

---

## 四、安全边界：网络、凭据、文件系统与审计

沙箱隔离的是「爆炸半径」，安全边界决定「爆炸半径里允许放什么」。四道墙，缺一不可。

### 4.1 网络出站白名单（egress /ˈiːɡres/，出站流量）

**默认全拒，按需放通**——这是深度防御的第一原则，仓库里 [sandbox 沙箱](../../Harness/sandbox沙箱.html) 的最佳实践第 1 条也反复强调。所有出站流量走代理，白名单之外一律拒绝并记录：

| 放通目标 | 用途 | 备注 |
|---------|------|------|
| `registry.npmjs.org` / `pypi.org` | 装依赖 | 限 GET，禁发布 |
| `github.com` | clone / 推分支 | 只读 token，见 4.2 |
| `api.anthropic.com`（经模型网关代理） | Agent 调模型 | 走内部网关，VM 看不到真实 API Key |
| 内网任意地址 | — | **全拒** 。Agent 的内网访问必须走宿主机侧的受控工具，不给裸网络 |

小北踩过的坑：白名单上线第一周，出站日志里抓到一个评审任务试图 POST 到一个陌生域名——事后归因是该仓库某个依赖的 install 脚本带的数据上报。**没有白名单，这事不会有人知道。**

### 4.2 凭据运行时注入：绝不打进镜像

镜像层是 **任何人都能 `docker history` 导出的** ，快照文件同样会落盘。凭据进镜像 = 凭据进垃圾堆：

```typescript
/** 凭据注入接口：凭据只在任务运行期存在于 VM 内存与进程环境中 */
interface CredentialInjector {
  /**
   * 任务启动时注入，绝不写入镜像层 / 快照文件 / 磁盘
   * @param scope 凭据作用域——作用域决定爆炸半径
   */
  inject(vm: VMHandle, creds: ScopedCredential[]): Promise<void>;
  /** 任务结束（含异常）必须调用：吊销 + 清内存 */
  revokeAll(vm: VMHandle): Promise<void>;
}

interface ScopedCredential {
  name: "git_read" | "git_push" | "model_gateway";
  /** 细粒度 PAT /ˈpæt/ （Personal Access Token，个人访问令牌）：git_read 只读、git_push 仅限本 PR 分支 */
  token: string;
  /** 短时效：git_push 类 15 分钟过期，超时任务由宿主机侧续签 */
  expiresAt: number;
}
```

三条铁律：

1. **clone 用只读 token，推分支用「仅限本 PR 分支、15 分钟时效」的短令牌**，任务结束即吊销；
2. **模型调用经内部网关中转**，VM 里永远没有真实模型 API Key；
3. **凭据注入发生在快照恢复之后**——否则快照文件里就带着凭据落盘了。

### 4.3 文件系统：只读层 + 可写区

```text
/               ← 只读（rootfs，来自镜像，模型改不动）
/workspace      ← 可写（overlayfs /ˈoʊvərleɪ ɛf ɛs/ 联合挂载，任务产物都在这）
/tmp            ← 可写（tmpfs，重启即清）
/host/...       ← 不存在。宿主机任何目录都不挂进 VM
```

模型要「改系统配置」的诉求一律拒绝——不是靠提示词求它别改，是 **文件系统层面改不了** 。任务产物只从 `/workspace` 收集，导出前跑一遍敏感信息扫描。

### 4.4 执行审计与回放

沙箱里发生的一切必须留痕在 **沙箱外** （追加写日志，VM 内进程改不了）：

```typescript
/** 审计事件：任务结束可完整回放「Agent 到底做了什么」 */
interface AuditEvent {
  taskId: string;
  ts: number;
  kind: "exec" | "file_write" | "net_connect" | "credential_use";
  /** exec 存完整命令行；file_write 存路径 + diff 摘要；net_connect 存目标域名与端口 */
  detail: string;
  /** 违反策略的事件（白名单外连接、越权路径写入）标红，触发告警 */
  violation: boolean;
}
```

回放的定义：**同一镜像 + 同一事件序列 = 同一结果** 。有了审计流，出事时能回答「它执行过什么命令、写过哪些文件、连过哪些域名」，而不是对着一片狼藉猜。小北 4.1 节那个陌生域名，就是靠 `net_connect` 事件 5 分钟定位的。

---

## 五、Coding Agent 的云端主机形态

### 5.1 每任务一个隔离 VM

Coding Agent（自动写码 / 评审 / 修 bug 类）的云端形态有一条已收敛的共识：**每任务一个独立 VM，跑完即弃**——Devin、Jules、Codex 云端都是这个形态（对照表见 [sandbox 沙箱](../../Harness/sandbox沙箱.html) 第九节）。落到小北的评审 Agent 上：

```text
PR 事件（webhook）→ 任务队列 → 池调度（第三节）→ microVM
  ├ clone 仓库 + checkout PR 分支（只读 token）
  ├ 静态分析 + 跑测试 + 跑构建
  ├ 生成评审意见
  └ 产物导出（/workspace 收集）→ VM 销毁 → 凭据吊销 → 审计归档
```

并行的价值在于 **任务之间零共享** ：周一早高峰 8 个 PR 同时评审，8 台 VM 各干各的，一个任务的 `cargo build` 打满自己的 2 核，别人毫无感知——第一节那个事故在这个形态下 **结构性不可能再发生** 。

### 5.2 产出 PR 的闭环

评审不止「提意见」，修复类任务要闭环回 Git：

| 步骤 | 动作 | 用什么凭据 |
|------|------|-----------|
| 1 | clone + checkout | 只读 token |
| 2 | 分析 / 修改 / 跑测试 | 无网络凭据需求 |
| 3 | push 到 `agent/fix-<pr>-<run>` 分支 | 短时效 push token（15 min） |
| 4 | 开 Draft PR 并 @ 人类评审 | 同上 |
| 5 | 人类合并或驳回，Agent 的凭据此时早已吊销 | — |

**人类检查点放在合并前** ，且验收标准（CI 通过）不写在 Agent 可写的路径里——沙箱挡得住逃逸，挡不住「Agent 把测试改成永远通过」这种逻辑越权。

### 5.3 与本地 CLI 的分工

| 维度 | 本地 CLI（Claude Code 类） | 云端主机形态（本篇主角） |
|------|---------------------------|--------------------------|
| 触发方式 | 人手动发起，交互式 | 事件驱动（webhook / 定时），无人值守 |
| 凭据 | 你自己的开发机凭据（作用域 = 你的账号） | 短时效最小作用域凭据 |
| 并行 | 一个开发者同时 1–2 个会话 | 几十上百任务并行 |
| 适合 | 结对编程、探索、改本地仓库 | 批量评审、批量修复、定时巡检 |
| 爆炸半径 | 你的本机（有权限系统兜底） | 一台用完即焚的 VM |

两者不是替代关系：小北自己写代码用本地 CLI，团队的 PR 洪水由云端主机消化。

---

## 六、成本与容量规划

### 6.1 单 VM 时租账

以小北的单个评审任务为单位拆账（实测口径）：

| 段 | 时长 | 说明 |
|----|------|------|
| 就绪（快照恢复） | 0.6s | 池命中时不计，池未命中才发生 |
| clone + 依赖就绪 | ~6 min | 镜像已预装工具链，只剩仓库本身依赖 |
| 分析 + 测试 + 构建 | ~11 min | 任务主体 |
| 产物导出 + 销毁 | <5s | VM 侧 |
| 粘性保活期望 | 3 min | 10 min 窗口 × 30% 追加率（3.3 节） |
| **合计计费时长** | **~21 min** | ≈ 0.35 VM·h / 任务 |

### 6.2 并发与池容量

- 每天 40 个 PR，集中分布在 10 个工作小时内 → 平均并发 = 40 × 18 min ÷ 600 min ≈ **1.2** ；
- 周一早高峰实测峰值并发 **8** ；
- 池规格：预热 4 台 + 弹性上限 16，池命中率 92%；
- 一台 16 vCPU / 32 GB 宿主机可放 ~10 个并发 VM（2C/2G + 20% 系统开销），峰值覆盖需 1 台、高可用起 2 台。

### 6.3 月成本测算

按 1200 任务/月（40 × 30）测算，数字为 **行业常见量级** 的估算，非厂商报价：

| 方案 | 计算 | 月成本估算 | 新任务就绪 | 运维负担 |
|------|------|-----------|-----------|---------|
| 弹性云单 VM / 任务 | 360 VM·h × ¥0.25/h（2C4G 按量） | ~¥100 + 存储 | 40–90s（冷启动 + 拉镜像），体验差 | 低 |
| 托管沙箱（E2B / Daytona / Modal 类） | 1200 任务 × ¥0.3–0.8/任务（按 vCPU·秒计费折算） | ¥400–1,000 | 0.3–3s | 低 |
| **自建 Firecracker 池**（小北现行） | 2 台 16C/32G 宿主机包年 ¥1,100/台 + 存储 / 带宽 | **~¥2,400** | 620ms | 高（需专人管内核与快照） |
| 混合：自建池 + 云爆发 | 池覆盖日常 92%，突发上云按量 | ~¥2,600 | 常态 620ms | 中 |

怎么读这张表：

- **任务量小（<300/月）选托管沙箱**：省下的是专职运维人力，那才是大头；
- **任务量大且延迟敏感（快照恢复刚需）选自建池**：¥2,400 换 620ms 就绪和完全的数据自持；
- **弹性云裸 VM 看似最便宜，实际不可用**——40–90 秒的就绪延迟乘以每个任务，等于把自动化的即时性优势全丢了；
- 成本大头永远不是 compute，是 **人** ：自建方案省下的沙箱费用，往往不够付维护它的工程师半天工资。

---

## 七、端到端落地示例：四周迭代

小北的代码评审 Agent，团队 60 人、每天 40 个 PR，四周从零到生产：

| 周 | 动作 | 产出 | 指标 |
|----|------|------|------|
| W1 | 用托管沙箱直接上线跑通闭环：webhook → 沙箱评审 → 评审意见回 PR；出站白名单 + 短时效凭据 | MVP（托管沙箱版） | 40 PR/天全覆盖，就绪 1.8s，单任务托管费约 ¥0.5（量级） |
| W2 | 制作预装镜像（3.1 清单）+ 审计事件流 + 回放工具 | 基础镜像 1.8 GB + 审计管道 | 依赖安装从 6min12s 压到 40s（仅 clone 仓库自身依赖）；抓到一次依赖外传 |
| W3 | 自建 Firecracker 池：快照制作与分发 + 池管理器（3.2 代码）+ 会话粘性 | 生产池（预热 4 / 上限 16） | 就绪 7.4s → 620ms；池命中率 92% |
| W4 | 容量压测 + 混合爆发 + 粘性账本；runbook（内核升级、快照失效回退到托管沙箱） | 容量方案 + 故障预案 | 月成本约 ¥2,400；VM 有效利用率 86%；评审意见采纳率 74% |

四周的迁移路径本身就是选型答案：**W1 用托管沙箱买时间验证价值，W3 流量稳定且延迟成为瓶颈后再自建**。直接从自建起步的团队，通常死在 W3 的快照分发和内核升级上——那是第二个月的活，不是第一周的。

## 自检清单

- [ ] Agent 负载与 Web 服务分池部署，任务环境满足「可重置 / 可销毁」契约；
- [ ] 执行环境档位按「不可信代码 / 多租户 / 快照需求 / GUI / 运维人力」五输入决策，而非默认复用现有设施；
- [ ] 工具链全部预装进镜像并分层（系统 / 工具链 / Agent 三层独立更新）；
- [ ] 高频任务走快照恢复（亚秒级）而非冷启动，池命中率 ≥90%，粘性保活只发给可追加任务；
- [ ] 出站默认全拒 + 白名单放通，出站日志有人看；
- [ ] 凭据运行时注入、短时效、任务结束即吊销，镜像与快照里查不到任何 token；
- [ ] rootfs 只读、可写区限 `/workspace`，产物导出前跑敏感信息扫描；
- [ ] 审计事件（exec / file_write / net_connect / credential_use）沙箱外追加写留痕，支持完整回放；
- [ ] 月成本有一张分档测算表，且标注了「实测口径」与「行业常见量级」的边界。

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **VM** | /ˌviː ˈem/ | Virtual Machine | 虚拟机 |
| **microVM** | /ˈmaɪkroʊ viː ˈem/ | micro Virtual Machine | 微型虚拟机 |
| **API** | /ˌeɪ piː ˈaɪ/ | Application Programming Interface | 应用程序接口 |
| **CPU** | /ˌsiː piː ˈjuː/ | Central Processing Unit | 中央处理器 |
| **CLI** | /ˌsiː el ˈaɪ/ | Command Line Interface | 命令行界面 |
| **CI** | /ˌsiː ˈaɪ/ | Continuous Integration | 持续集成 |
| **PR** | /ˌpiː ˈɑːr/ | Pull Request | 拉取请求（代码合并申请） |
| **PAT** | /pæt/ | Personal Access Token | 个人访问令牌 |
| **SDK** | /ˌes diː ˈkeɪ/ | Software Development Kit | 软件开发工具包 |
| **SSH** | /ˌes es ˈeɪtʃ/ | Secure Shell | 安全外壳协议 |
| **KVM** | /ˌkeɪ viː ˈem/ | Kernel-based Virtual Machine | 基于内核的虚拟机 |
| **OCI** | /ˌoʊ siː ˈaɪ/ | Open Container Initiative | 开放容器计划（容器镜像与运行时标准） |
| **TTL** | /ˌtiː tiː ˈel/ | Time To Live | 存活时间 |

## 参考资料

- [Firecracker 官方文档（含快照机制与启动延迟）](https://firecracker-microvm.github.io/)（AWS 开源 microVM）
- [Firecracker Snapshots 指南](https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshots.md)（快照恢复原理）
- [gVisor 官方文档](https://gvisor.dev/docs/)（Google 用户态内核沙箱）
- [Kata Containers 官方文档](https://docs.kata-containers.io/)（容器接口 + VM 隔离）
- [E2B 文档](https://e2b.dev/docs)（面向 Agent 的托管云沙箱）
- [Daytona 文档](https://www.daytona.io/docs)（托管沙箱与工作区重挂接）
- [sandbox 沙箱 · 本仓库](../../Harness/sandbox沙箱.html)（沙箱机制与各家 Harness 实践对照）
- [多租户与隔离 · 本仓库](08-多租户与隔离.html)（数据与配额侧的租户隔离）
