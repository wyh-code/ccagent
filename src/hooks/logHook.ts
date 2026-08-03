// hooks/logHook.ts - PreToolUse 钩子：记录每次工具调用
import { gray } from "../utils/colors.js";

export function logHook(name: string, args: Record<string, unknown>): null {
  const preview = JSON.stringify(Object.values(args).slice(0, 2)).slice(0, 60);
  console.log(gray(`[HOOK] ${name}(${preview})`));
  return null;
}
