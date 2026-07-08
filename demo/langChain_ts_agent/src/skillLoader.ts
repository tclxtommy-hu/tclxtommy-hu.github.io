import * as fs from "node:fs";
import * as path from "node:path";

/**
 * 一个「技能包」= skills/<name>/ 目录，内含：
 *   - skill.md   : frontmatter(元数据) + 正文(SOP，注入 LLM)
 *   - run.js / run.py : 被沙盒执行的脚本
 *
 * 这里只负责把磁盘上的技能包解析成结构化对象，真正做到
 * 「新增技能 = 丢一个文件夹进去」，运行时零代码改动（动态注入）。
 */
export interface SkillPackage {
  name: string;
  description: string;
  instructions: string; // skill.md 正文：注入 LLM 的 SOP
  entry: string; // 入口脚本文件名，如 run.js；纯指令型技能可留空
  runtime: "node" | "python";
  dir: string; // 该技能包所在目录的绝对路径
}

/**
 * 扫描目录，动态加载所有技能包。
 * 这是「动态注入」的核心：不依赖任何硬编码注册表。
 */
export function loadSkillsFromDir(dir: string): SkillPackage[] {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    console.warn(`[skillLoader] 技能目录不存在：${absDir}`);
    return [];
  }
  const out: SkillPackage[] = [];
  for (const name of fs.readdirSync(absDir)) {
    const skillDir = path.join(absDir, name);
    if (!fs.statSync(skillDir).isDirectory()) continue;
    const mdPath = path.join(skillDir, "skill.md");
    if (!fs.existsSync(mdPath)) continue;
    const parsed = parseSkillMarkdown(fs.readFileSync(mdPath, "utf8"));
    if (parsed) out.push({ ...parsed, dir: skillDir });
  }
  return out;
}

function parseSkillMarkdown(raw: string): Omit<SkillPackage, "dir"> | null {
  // 解析 --- ... --- 包裹的 YAML frontmatter + 之后的 Markdown 正文
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) {
    console.warn("[skillLoader] 缺少 frontmatter，已跳过该技能包");
    return null;
  }
  const fm = parseFrontmatter(m[1]);
  const body = m[2].trim();

  const name = fm.name?.trim();
  const description = fm.description?.trim();
  const entry = fm.entry?.trim() ?? ""; // 可选：纯指令型技能不挂脚本
  const runtimeRaw = (fm.runtime ?? "node").trim().toLowerCase();
  const runtime: "node" | "python" = runtimeRaw === "python" ? "python" : "node";

  if (!name || !description) {
    console.warn("[skillLoader] 必要字段缺失(name/description)，已跳过");
    return null;
  }
  return { name, description, entry, runtime, instructions: body };
}

/** 极简 frontmatter 解析器（零依赖，只支持 key: value 平铺） */
function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}
