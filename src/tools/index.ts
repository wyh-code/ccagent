// 工具注册表：把所有可用工具的 schema 与执行函数集中管理
// 后续（read_file/write_file/edit_file/glob 等）只需要新增文件并在这里注册
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { bashToolSchema, runBash } from "./bash.js";

export const TOOLS: ChatCompletionTool[] = [bashToolSchema];

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  bash: runBash,
};
