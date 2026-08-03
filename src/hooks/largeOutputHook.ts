// hooks/largeOutputHook.ts - PostToolUse 钩子：工具输出过大时告警
import { yellow } from "../utils/colors.js";

const LARGE_OUTPUT_THRESHOLD = 100_000;

export function largeOutputHook(
  name: string,
  _args: Record<string, unknown>,
  output: string
): null {
  if (output.length > LARGE_OUTPUT_THRESHOLD) {
    console.log(yellow(`[HOOK] ⚠ ${name} 输出过大：${output.length} 字符`));
  }
  return null;
}
