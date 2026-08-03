// agent.ts - Agent 核心循环
//
// AI 编程 Agent 的全部秘密，浓缩在一个模式里：
//     while (finishReason === "tool_calls") {
//         response = await LLM(messages, tools);
//         执行工具;
//         追加结果;
//     }
//
//     +----------+      +-------+      +---------+
//     |   用户   | ---> |  LLM  | ---> |  工具   |
//     |  提示词  |      |       |      |  执行   |
//     +----------+      +---+---+      +----+----+
//                           ^               |
//                           |   tool_result |
//                           +---------------+
//                           (循环继续)
//
// 这就是核心循环：把工具执行结果回传给模型，直到模型决定停止。
// 生产级 Agent 在此基础上叠加策略、钩子和生命周期控制。
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MODEL, SYSTEM, openai } from "./config.js";
import { TOOL_HANDLERS, TOOLS } from "./tools/index.js";
import { yellow } from "./utils/colors.js";

export async function agentLoop(messages: ChatCompletionMessageParam[]): Promise<void> {
  while (true) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      tools: TOOLS,
      max_tokens: 8000,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("OpenAI 响应中没有 choices");
    }
    const assistant = choice.message;
    // Node SDK 返回的就是普通对象，role: "assistant" 已经带上了，
    // 不需要像手写序列化那样额外补字段
    messages.push(assistant);

    if (!assistant.tool_calls) {
      return;
    }

    for (const toolCall of assistant.tool_calls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      console.log(yellow(`> ${name}`));

      const handler = TOOL_HANDLERS[name];
      const output = handler ? await handler(args) : `未知工具：${name}`;
      console.log(output.slice(0, 200));

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }
}
