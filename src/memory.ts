// memory.ts - 跨会话持久化记忆：把用户偏好/项目事实等知识写成 Markdown 文件，
// 长期保存在 .memory/ 目录下，供之后的会话复用
//
//   .memory/
//     MEMORY.md   ← 索引（每条记忆一行，供 SYSTEM 提示词常驻展示）
//     *.md        ← 单条记忆（YAML frontmatter + 正文）
//
// 每轮对话结束后从原始消息里提取新记忆，写入的记忆条数达到阈值后会触发一次合并整理
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MODEL, TEXT_ENCODING, WORKDIR, openai } from "./config.js";
import { yellow } from "./utils/colors.js";
import { parseFrontmatter } from "./utils/frontmatter.js";
import { messageText } from "./utils/messageText.js";

// 记忆文件存放目录，进程启动时就确保存在
export const MEMORY_DIR = join(WORKDIR, ".memory");
mkdirSync(MEMORY_DIR, { recursive: true });

// 记忆索引文件路径
export const MEMORY_INDEX_PATH = join(MEMORY_DIR, "MEMORY.md");

// 记忆分类，供写入时标注、之后按类型检索使用
export const MEMORY_TYPES = ["user", "feedback", "project", "reference"];

interface MemoryFile {
  filename: string;
  name: string;
  description: string;
  type: string;
  body: string;
}

// 把一段文本开头结尾连续出现的目标字符全部去掉（全局替换，不止替换第一个）
function replaceAll(text: string, target: string, replacement: string): string {
  return text.split(target).join(replacement);
}

// 写入一条记忆文件（YAML frontmatter + 正文），写完立即重建索引
export function writeMemoryFile(name: string, type: string, description: string, body: string): string {
  const slug = replaceAll(replaceAll(name.toLowerCase(), " ", "-"), "/", "-");
  const filePath = join(MEMORY_DIR, `${slug}.md`);
  writeFileSync(
    filePath,
    `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n\n${body}\n`,
    TEXT_ENCODING
  );
  rebuildIndex();
  return filePath;
}

// 列出所有记忆文件名（不含索引文件本身），按文件名排序
function listMemoryFilenames(): string[] {
  if (!existsSync(MEMORY_DIR)) {
    return [];
  }
  return readdirSync(MEMORY_DIR)
    .filter((name) => name.endsWith(".md") && name !== "MEMORY.md")
    .sort();
}

// 根据现有记忆文件重建 MEMORY.md 索引
function rebuildIndex(): void {
  const lines: string[] = [];
  for (const filename of listMemoryFilenames()) {
    const raw = readFileSync(join(MEMORY_DIR, filename), TEXT_ENCODING);
    const { meta, body } = parseFrontmatter(raw);
    const name = meta.name ?? filename.replace(/\.md$/, "");
    const description = meta.description ?? (body.split("\n")[0] ?? "").slice(0, 80);
    lines.push(`- [${name}](${filename}) — ${description}`);
  }
  writeFileSync(MEMORY_INDEX_PATH, lines.length > 0 ? lines.join("\n") + "\n" : "", TEXT_ENCODING);
}

// 读取记忆索引内容，每轮注入 SYSTEM 提示词
export function readMemoryIndex(): string {
  if (!existsSync(MEMORY_INDEX_PATH)) {
    return "";
  }
  return readFileSync(MEMORY_INDEX_PATH, TEXT_ENCODING).trim();
}

// 读取单条记忆文件的完整内容
function readMemoryFile(filename: string): string | null {
  const filePath = join(MEMORY_DIR, filename);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, TEXT_ENCODING);
}

// 列出所有记忆文件，解析出 frontmatter 与正文
function listMemoryFiles(): MemoryFile[] {
  return listMemoryFilenames().map((filename) => {
    const raw = readFileSync(join(MEMORY_DIR, filename), TEXT_ENCODING);
    const { meta, body } = parseFrontmatter(raw);
    return {
      filename,
      name: meta.name ?? filename.replace(/\.md$/, ""),
      description: meta.description ?? "",
      type: meta.type ?? "user",
      body,
    };
  });
}

// 根据近期对话，从记忆目录里选出明显相关的几条记忆文件名
async function selectRelevantMemories(
  messages: ChatCompletionMessageParam[],
  maxItems = 5
): Promise<string[]> {
  const files = listMemoryFiles();
  if (files.length === 0) {
    return [];
  }

  // 收集最近几轮 user 消息的文本，按时间顺序拼接
  const recentTexts: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      const text = messageText(message).trim();
      if (text) {
        recentTexts.push(text);
      }
      if (recentTexts.length >= 3) {
        break;
      }
    }
  }
  const recent = recentTexts.reverse().join(" ").slice(0, 2000);
  if (!recent.trim()) {
    return [];
  }

  const catalog = files
    .map((file, index) => `${index}: ${file.name} — ${file.description}`)
    .join("\n");
  const prompt =
    "根据近期对话和下方记忆目录，选出明显相关的记忆索引。" +
    "仅返回 JSON 整数数组，例如 [0, 3]。若无相关则返回 []。\n\n" +
    `近期对话:\n${recent}\n\n` +
    `记忆目录:\n${catalog}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });
    const text = (response.choices[0]?.message.content ?? "").trim();
    const match = text.match(/\[.*?\]/s);
    if (match) {
      const indices: unknown = JSON.parse(match[0]);
      const selected: string[] = [];
      if (Array.isArray(indices)) {
        for (const idx of indices) {
          if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < files.length) {
            const file = files[idx];
            if (file) {
              selected.push(file.filename);
            }
            if (selected.length >= maxItems) {
              break;
            }
          }
        }
      }
      return selected;
    }
  } catch {
    // 忽略异常，走下面的关键词兜底
  }

  // LLM 选择失败或没解析出结果时，退回简单的关键词匹配
  const keywords = recent
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .map((word) => word.toLowerCase());
  const selected: string[] = [];
  for (const file of files) {
    const text = `${file.name} ${file.description}`.toLowerCase();
    if (keywords.some((keyword) => text.includes(keyword))) {
      selected.push(file.filename);
      if (selected.length >= maxItems) {
        break;
      }
    }
  }
  return selected;
}

// 加载相关记忆的正文，包一层 <relevant_memories> 标签，用于注入本轮 SYSTEM 提示词
export async function loadMemories(messages: ChatCompletionMessageParam[]): Promise<string> {
  const selectedFiles = await selectRelevantMemories(messages);
  if (selectedFiles.length === 0) {
    return "";
  }
  const parts = ["<relevant_memories>"];
  for (const filename of selectedFiles) {
    const content = readMemoryFile(filename);
    if (content) {
      parts.push(content);
    }
  }
  parts.push("</relevant_memories>");
  return parts.join("\n\n");
}

// 从最近的对话中提取新记忆（每轮结束时调用），失败时静默跳过、不影响主流程
export async function extractMemories(
  messages: { role: string; content: unknown }[]
): Promise<void> {
  const dialogueParts: string[] = [];
  for (const message of messages.slice(-10)) {
    const text = messageText(message).trim();
    if (text) {
      dialogueParts.push(`${message.role || "?"}: ${text}`);
    }
  }
  const dialogue = dialogueParts.join("\n");
  if (!dialogue.trim()) {
    return;
  }

  const existing = listMemoryFiles();
  const existingDesc =
    existing.length > 0
      ? existing.map((memory) => `- ${memory.name}: ${memory.description}`).join("\n")
      : "（无）";
  const prompt =
    "从对话中提取用户偏好、约束或项目事实。\n" +
    "返回 JSON 数组，每项: {name, type, description, body}。\n" +
    "- name: 短 kebab-case 标识\n" +
    "- type: user | feedback | project | reference\n" +
    "- description: 一行摘要供索引检索\n" +
    "- body: markdown 详情\n" +
    "若无新内容或已被现有记忆覆盖，返回 []。\n\n" +
    `现有记忆:\n${existingDesc}\n\n` +
    `对话:\n${dialogue.slice(0, 4000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    });
    const text = (response.choices[0]?.message.content ?? "").trim();
    const match = text.match(/\[.*\]/s);
    if (!match) {
      return;
    }
    const items: unknown = JSON.parse(match[0]);
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    let count = 0;
    for (const item of items) {
      const memory = item as Record<string, unknown>;
      const name = typeof memory.name === "string" ? memory.name : `memory_${Math.floor(Date.now() / 1000)}`;
      const type = typeof memory.type === "string" ? memory.type : "user";
      const description = typeof memory.description === "string" ? memory.description : "";
      const body = typeof memory.body === "string" ? memory.body : "";
      if (description && body) {
        writeMemoryFile(name, type, description, body);
        count += 1;
      }
    }
    if (count > 0) {
      console.log(yellow(`\n[记忆: 提取了 ${count} 条新记忆]`));
    }
  } catch {
    // 忽略异常，记忆提取是尽力而为的辅助功能，不应该影响主流程
  }
}

// 记忆条数达到这个阈值就触发一次合并整理
const CONSOLIDATE_THRESHOLD = 10;

// 合并/整理重复或过时的记忆，把总数控制在一个合理范围内
export async function consolidateMemories(): Promise<void> {
  const files = listMemoryFiles();
  if (files.length < CONSOLIDATE_THRESHOLD) {
    return;
  }

  const catalog = files
    .map(
      (file) =>
        `## ${file.filename}\nname: ${file.name}\ndescription: ${file.description}\n${file.body}`
    )
    .join("\n\n");
  const prompt =
    "合并以下记忆文件。规则:\n" +
    "1. 重复项合并为一条\n" +
    "2. 删除过时/矛盾的记忆\n" +
    "3. 总数控制在 30 条以内\n" +
    "4. 优先保留重要用户偏好\n" +
    "返回 JSON 数组，每项: {name, type, description, body}。\n\n" +
    catalog.slice(0, 16000);

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
    });
    const text = (response.choices[0]?.message.content ?? "").trim();
    const match = text.match(/\[.*\]/s);
    if (!match) {
      return;
    }
    const items: unknown = JSON.parse(match[0]);
    // 只有确实解析出非空的合并结果才清空重写，避免模型返回空数组时把记忆全部清空
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    for (const filename of listMemoryFilenames()) {
      unlinkSync(join(MEMORY_DIR, filename));
    }
    for (const item of items) {
      const memory = item as Record<string, unknown>;
      const name = typeof memory.name === "string" ? memory.name : `memory_${Math.floor(Date.now() / 1000)}`;
      const type = typeof memory.type === "string" ? memory.type : "user";
      const description = typeof memory.description === "string" ? memory.description : "";
      const body = typeof memory.body === "string" ? memory.body : "";
      if (description && body) {
        writeMemoryFile(name, type, description, body);
      }
    }
    console.log(yellow(`\n[记忆: 已整理 ${files.length} → ${items.length} 条]`));
  } catch {
    // 忽略异常，整理失败时保留现有记忆不动
  }
}
