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
// 扩展逻辑（权限校验、日志、大输出告警、结束时的摘要）都不写死在这个循环里，
// 而是挂到 hooks 模块暴露的几个事件上，循环本身保持干净。
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { MODEL, SYSTEM, openai } from "./config.js";
import { triggerPostToolUse, triggerPreToolUse, triggerStop } from "./hooks/index.js";
import { TOOL_HANDLERS, TOOLS } from "./tools/index.js";

// SDK 返回的消息对象里，没有内容的字段会显式给 null（比如纯工具调用时 content/refusal
// 都是 null），直接塞进历史后续请求会把这些 null 字段原样带上；这里把它们过滤掉，
// 只保留真正有值的字段再放进对话历史
function toHistoryMessage(message: ChatCompletionMessage): ChatCompletionMessageParam {
  const entries = Object.entries(message).filter(([, value]) => value !== null);
  return Object.fromEntries(entries) as ChatCompletionMessageParam;
}

// 距离上一次调用 todo_write 已经过去的轮数，达到阈值就催促模型更新任务列表
let roundsSinceTodo = 0;
const TODO_REMINDER_ROUNDS = 3;

export async function agentLoop(messages: ChatCompletionMessageParam[]): Promise<void> {
  while (true) {
    if (roundsSinceTodo >= TODO_REMINDER_ROUNDS && messages.length > 0) {
      messages.push({
        role: "user",
        content: "<reminder>请更新你的 todo 列表。</reminder>",
      });
      roundsSinceTodo = 0;
    }

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
    messages.push(toHistoryMessage(assistant));

    if (!assistant.tool_calls) {
      // Stop 钩子：返回非 null 就当成新的用户消息追加，循环继续；否则真正结束
      const forced = await triggerStop(messages);
      if (forced !== null) {
        messages.push({ role: "user", content: forced });
        continue;
      }
      return;
    }

    // 本轮 assistant 发起了工具调用，计数器累加；调用 todo_write 会在下面重新清零
    roundsSinceTodo += 1;

    for (const toolCall of assistant.tool_calls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      const blocked = await triggerPreToolUse(name, args);
      if (blocked !== null) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: blocked,
        });
        continue;
      }

      const handler = TOOL_HANDLERS[name];
      const output = handler ? await handler(args) : `未知工具：${name}`;
      await triggerPostToolUse(name, args, output);
      if (name === "todo_write") {
        roundsSinceTodo = 0;
      }
      console.log(output.slice(0, 200));

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }
}
