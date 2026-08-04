// 主 Agent 的系统提示词：在环境变量/技能扫描都就绪之后拼出目录，
// 单独成模块是为了避免 config.ts 与 skills.ts 相互引用
import { WORKDIR } from "./config.js";
import { listSkills } from "./skills.js";

function buildSystem(): string {
  const catalog = listSkills();
  return (
    `你是一个位于 ${WORKDIR} 的编程 Agent。\n` +
    `可用技能：\n${catalog}\n` +
    "需要完整说明时，使用 load_skill 加载。" +
    "遇到复杂子问题时，使用 task 工具派生子 Agent。" +
    "开始多步骤任务前，先用 todo_write 规划步骤。" +
    "上下文过长时可使用 compact 工具。" +
    "直接行动，不要解释。"
  );
}

// 系统提示词，告知模型自己所处的工作目录、可用技能目录，以及规划/派生子 Agent/压缩上下文的指引
export const SYSTEM = buildSystem();
