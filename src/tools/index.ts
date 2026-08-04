// 工具注册表：把所有可用工具的 schema 与执行函数集中管理
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BASE_HANDLERS, BASE_TOOLS } from "./baseTools.js";
import { loadSkillToolSchema, runLoadSkill } from "./loadSkill.js";
import { runTask, taskToolSchema } from "./task.js";
import { runTodoWrite, todoWriteToolSchema } from "./todoWrite.js";
import type { ToolHandler } from "./types.js";

export type { ToolHandler };

// 完整工具集合：基础五个工具之外，再加上 todo_write、task、load_skill（子 Agent 内部只用基础五个，见 baseTools.ts）
export const TOOLS: ChatCompletionTool[] = [
  ...BASE_TOOLS,
  todoWriteToolSchema,
  taskToolSchema,
  loadSkillToolSchema,
];

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  ...BASE_HANDLERS,
  todo_write: runTodoWrite,
  task: runTask,
  load_skill: runLoadSkill,
};
