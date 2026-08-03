// tools/readFile.ts - read_file 工具：读取文件内容，可选限制返回行数
import { readFile } from "node:fs/promises";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { safePath } from "../utils/safePath.js";

// 按行拆分文本：统一识别 \r\n/\r/\n 三种换行符，且末尾的换行符不会产生多余的空行
function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "" && /\r\n|\r|\n$/.test(text)) {
    lines.pop();
  }
  return lines;
}

export async function runRead(args: Record<string, unknown>): Promise<string> {
  const path = args.path as string;
  const limit = args.limit as number | undefined;
  try {
    let lines = splitLines(await readFile(safePath(path), "utf-8"));
    if (limit && limit < lines.length) {
      lines = [...lines.slice(0, limit), `...（还有 ${lines.length - limit} 行）`];
    }
    return lines.join("\n");
  } catch (error) {
    return `错误：${error instanceof Error ? error.message : String(error)}`;
  }
}

export const readFileToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_file",
    description: "读取文件内容。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["path"],
    },
  },
};
