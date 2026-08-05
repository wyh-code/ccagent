// 主 Agent 的系统提示词：拼出技能目录 + 记忆索引等常驻信息。
// 记忆索引会随对话推进而变化，所以这里导出的是一个函数，每轮请求前都要重新调用一次，
// 而不是像之前那样在模块加载时算好存成常量
import { WORKDIR } from "./config.js";
import { readMemoryIndex } from "./memory.js";
import { listSkills } from "./skills.js";

export function buildSystemPrompt(): string {
  const catalog = listSkills();
  const memoryIndex = readMemoryIndex();
  const memorySection = memoryIndex ? `\n\n可用记忆：\n${memoryIndex}` : "";
  return (
    `你是一个位于 ${WORKDIR} 的编程 Agent。\n` +
    `可用技能：\n${catalog}\n` +
    "需要完整说明时，使用 load_skill 加载。" +
    "遇到复杂子问题时，使用 task 工具派生子 Agent。" +
    "开始多步骤任务前，先用 todo_write 规划步骤。" +
    "上下文过长时可使用 compact 工具。" +
    `${memorySection}\n` +
    "下方会注入相关记忆正文，请遵守记忆中的用户偏好。" +
    "用户说「记住」或表达明确偏好时，应提取为记忆。" +
    "直接行动，不要解释。"
  );
}
