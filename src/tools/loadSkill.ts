// load_skill 工具：按名称从技能注册表中取出对应 SKILL.md 的完整内容
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { SKILL_REGISTRY } from "../skills.js";
import { gray } from "../utils/colors.js";

export async function runLoadSkill(args: Record<string, unknown>): Promise<string> {
  const name = args.name as string;
  const skill = SKILL_REGISTRY[name];
  if (!skill) {
    return `未找到技能：${name}`;
  }
  console.log(gray(`[技能] 已加载 ${name}`));
  return skill.content;
}

// load_skill 工具的 function-calling schema
export const loadSkillToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "load_skill",
    description: "按名称加载技能的完整内容。",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
};
