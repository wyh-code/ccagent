// hooks/contextInjectHook.ts - UserPromptSubmit 钩子：把工作目录注入到用户 prompt 前面
import { WORKDIR } from "../config.js";
import { gray } from "../utils/colors.js";

export function contextInjectHook(query: string): string {
  console.log(gray(`[HOOK] UserPromptSubmit：注入工作目录 ${WORKDIR}`));
  const context = `<context>\n当前工作目录：${WORKDIR}\n</context>\n\n`;
  return context + query;
}
