// 技能注册表：启动时扫描 skills/ 目录，为 SYSTEM 提示词提供技能目录，
// 并支撑 load_skill 工具按名称取出完整内容
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TEXT_ENCODING, WORKDIR } from "./config.js";
import { parseFrontmatter } from "./utils/frontmatter.js";

export const SKILLS_DIR = join(WORKDIR, "skills");

interface Skill {
  name: string;
  description: string;
  content: string;
}

// 技能名到技能信息的注册表，进程启动时扫描一次并填充
export const SKILL_REGISTRY: Record<string, Skill> = {};

// 扫描 skills/ 目录，把每个含 SKILL.md 的子目录注册进 SKILL_REGISTRY
export function scanSkills(): void {
  if (!existsSync(SKILLS_DIR)) {
    return;
  }

  const dirNames = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const dirName of dirNames) {
    const manifestPath = join(SKILLS_DIR, dirName, "SKILL.md");
    if (!existsSync(manifestPath)) {
      continue;
    }

    const raw = readFileSync(manifestPath, TEXT_ENCODING);
    const { meta } = parseFrontmatter(raw);
    const name = meta.name ?? dirName;
    // 没有 frontmatter 描述时，退回取正文首行去掉井号作为简介
    const description = meta.description ?? (raw.split("\n")[0] ?? "").replace(/^#+/, "").trim();
    SKILL_REGISTRY[name] = { name, description, content: raw };
  }
}

// 列出所有技能，每个技能一行（名称 + 简要描述），供 SYSTEM 提示词展示目录
export function listSkills(): string {
  const skills = Object.values(SKILL_REGISTRY);
  if (skills.length === 0) {
    return "（未找到技能）";
  }
  return skills.map((skill) => `- **${skill.name}**: ${skill.description}`).join("\n");
}

scanSkills();
