// tools/editFile.ts - edit_file 工具：在文件中精确替换一段文本（仅替换一次）
import { readFile, writeFile } from "node:fs/promises";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { TEXT_ENCODING } from "../config.js";
import { safePath } from "../utils/safePath.js";

export async function runEdit(args: Record<string, unknown>): Promise<string> {
  const path = args.path as string;
  const oldText = args.old_text as string;
  const newText = args.new_text as string;
  try {
    const filePath = safePath(path);
    const text = await readFile(filePath, TEXT_ENCODING);
    if (!text.includes(oldText)) {
      return `错误：在 ${path} 中未找到指定文本`;
    }
    // 字符串形式的 replace 只替换第一处匹配，满足"仅替换一次"的需求
    await writeFile(filePath, text.replace(oldText, newText), TEXT_ENCODING);
    return `已编辑 ${path}`;
  } catch (error) {
    return `错误：${error instanceof Error ? error.message : String(error)}`;
  }
}

export const editFileToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "edit_file",
    description: "在文件中精确替换一段文本（仅替换一次）。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
};
