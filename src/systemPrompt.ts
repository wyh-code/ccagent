// systemPrompt.ts - 按主题分段组装 SYSTEM 提示词，并按运行时上下文做确定性缓存：
// 上下文没变时直接复用上一次拼好的结果，不必每轮都重新拼一遍字符串。
// 真实使用中，稳定的片段顺序还有助于保住 API 一侧的 prompt 前缀缓存。
import { WORKDIR } from "./config.js";
import { readMemoryIndex } from "./memory.js";
import { listSkills } from "./skills.js";
import { TOOL_HANDLERS } from "./tools/index.js";
import { gray, green } from "./utils/colors.js";

// 驱动提示词组装的运行时上下文：只放会影响提示词内容、且可判等比较的字段
export interface PromptContext {
  enabledTools: string[];
  workspace: string;
  memories: string;
}

// 从当前真实状态派生上下文：可用工具、工作目录、记忆索引内容
export function updateContext(): PromptContext {
  return {
    enabledTools: Object.keys(TOOL_HANDLERS),
    workspace: WORKDIR,
    memories: readMemoryIndex(),
  };
}

// 按主题选择并拼接提示词片段；identity/workspace/tools/skills 始终包含，
// memory 只在记忆索引里确实有内容时才加入
function buildSections(context: PromptContext): string[] {
  const sections = [
    "你是一个编程 Agent。直接行动，不要解释。",
    `工作目录：${context.workspace}`,
    "遇到复杂子问题时，使用 task 工具派生子 Agent。" +
      "开始多步骤任务前，先用 todo_write 规划步骤。" +
      "上下文过长时可使用 compact 工具。",
    `可用技能：\n${listSkills()}\n需要完整说明时，使用 load_skill 加载。`,
  ];
  if (context.memories) {
    sections.push(
      `可用记忆：\n${context.memories}\n` +
        "下方会注入相关记忆正文，请遵守记忆中的用户偏好。" +
        "用户说「记住」或表达明确偏好时，应提取为记忆。"
    );
  }
  return sections;
}

function assembleSystemPrompt(context: PromptContext): string {
  return buildSections(context).join("\n\n");
}

// 把值按 key 排序后再序列化，保证同样内容的上下文总能算出同一个缓存键，
// 不会因为对象属性的声明顺序不同而被误判成"变了"
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

let lastContextKey: string | null = null;
let lastPrompt: string | null = null;

// 按上下文缓存组装结果：上下文序列化后的 key 和上一次相同就直接复用，避免重复拼装
export function getSystemPrompt(context: PromptContext): string {
  const key = stableStringify(context);
  if (key === lastContextKey && lastPrompt !== null) {
    console.log(gray("  [缓存命中] system prompt 未变化"));
    return lastPrompt;
  }

  lastContextKey = key;
  lastPrompt = assembleSystemPrompt(context);

  const loaded = ["identity", "workspace", "tools", "skills"];
  if (context.memories) {
    loaded.push("memory");
  }
  console.log(green(`  [已组装] 片段: ${loaded.join(", ")}`));
  return lastPrompt;
}
