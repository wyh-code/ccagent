// tools/writeFile.ts - write_file 工具：把内容写入文件（自动创建父目录）
import { mkdir, writeFile as writeFileAsync } from "node:fs/promises";
import { dirname } from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { TEXT_ENCODING } from "../config.js";
import { safePath } from "../utils/safePath.js";

export async function runWrite(args: Record<string, unknown>): Promise<string> {
  const path = args.path as string;
  const content = args.content as string;
  try {
    const filePath = safePath(path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFileAsync(filePath, content, TEXT_ENCODING);
    return `已写入 ${Buffer.byteLength(content, TEXT_ENCODING)} 字节到 ${path}`;
  } catch (error) {
    return `错误：${error instanceof Error ? error.message : String(error)}`;
  }
}

export const writeFileToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "write_file",
    description: "将内容写入文件。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
};
