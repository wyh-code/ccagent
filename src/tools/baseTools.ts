// 基础工具集合：子 Agent 只允许使用这五个工具，不含 todo_write 和 task，避免递归派生子 Agent
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { bashToolSchema, runBash } from "./bash.js";
import { editFileToolSchema, runEdit } from "./editFile.js";
import { globToolSchema, runGlob } from "./glob.js";
import { readFileToolSchema, runRead } from "./readFile.js";
import type { ToolHandler } from "./types.js";
import { runWrite, writeFileToolSchema } from "./writeFile.js";

export const BASE_TOOLS: ChatCompletionTool[] = [
  bashToolSchema,
  readFileToolSchema,
  writeFileToolSchema,
  editFileToolSchema,
  globToolSchema,
];

export const BASE_HANDLERS: Record<string, ToolHandler> = {
  bash: runBash,
  read_file: runRead,
  write_file: runWrite,
  edit_file: runEdit,
  glob: runGlob,
};
