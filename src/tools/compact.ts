// compact 工具：让模型主动请求压缩当前对话历史以释放上下文空间
//
// 这个工具没有对应的 TOOL_HANDLERS 条目——它在 agentLoop 里被拦截并特殊处理
// （直接调用 compactHistory 整段替换消息历史），不走常规的钩子/工具分发流程
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const compactToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "compact",
    description: "摘要较早对话以释放上下文空间。",
    parameters: {
      type: "object",
      properties: { focus: { type: "string" } },
      required: [],
    },
  },
};
