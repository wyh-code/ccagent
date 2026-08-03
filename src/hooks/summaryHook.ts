// hooks/summaryHook.ts - Stop 钩子：会话即将结束时打印工具调用次数摘要
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { gray } from "../utils/colors.js";

export function summaryHook(messages: ChatCompletionMessageParam[]): null {
  const toolCount = messages.filter((message) => message.role === "tool").length;
  console.log(gray(`[HOOK] Stop：本次会话共使用 ${toolCount} 次工具调用`));
  return null;
}
