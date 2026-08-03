// 工具注册表：把所有可用工具的 schema 与执行函数集中管理
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { bashToolSchema, runBash } from "./bash.js";
import { editFileToolSchema, runEdit } from "./editFile.js";
import { globToolSchema, runGlob } from "./glob.js";
import { readFileToolSchema, runRead } from "./readFile.js";
import { runTodoWrite, todoWriteToolSchema } from "./todoWrite.js";
import { runWrite, writeFileToolSchema } from "./writeFile.js";

export const TOOLS: ChatCompletionTool[] = [
  bashToolSchema,
  readFileToolSchema,
  writeFileToolSchema,
  editFileToolSchema,
  globToolSchema,
  todoWriteToolSchema,
];

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  bash: runBash,
  read_file: runRead,
  write_file: runWrite,
  edit_file: runEdit,
  glob: runGlob,
  todo_write: runTodoWrite,
};
