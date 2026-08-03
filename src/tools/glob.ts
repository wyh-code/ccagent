// tools/glob.ts - glob 工具：按 glob 模式在工作区目录下查找文件
import { isAbsolute, relative, resolve } from "node:path";
import { glob } from "glob";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { WORKDIR } from "../config.js";

export async function runGlob(args: Record<string, unknown>): Promise<string> {
  const pattern = args.pattern as string;
  try {
    // noglobstar 让 ** 按普通 * 处理，避免跨目录递归匹配
    const matches = await glob(pattern, { cwd: WORKDIR, dot: true, noglobstar: true });
    // 已经用 cwd 限定了搜索范围，这里再校验一遍是防止 pattern 里带 ../ 之类跑出工作区
    const results = matches.filter((match) => {
      const rel = relative(WORKDIR, resolve(WORKDIR, match));
      return !rel.startsWith("..") && !isAbsolute(rel);
    });
    return results.length > 0 ? results.join("\n") : "（无匹配）";
  } catch (error) {
    return `错误：${error instanceof Error ? error.message : String(error)}`;
  }
}

export const globToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "glob",
    description: "按 glob 模式查找文件。",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: ["pattern"],
    },
  },
};
