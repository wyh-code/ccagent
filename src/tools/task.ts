// task 工具：派生一个使用全新对话历史的子 Agent，实现上下文隔离——子 Agent 内部
// 的完整工具调用过程对父级不可见，只把最终摘要文本带回父级的对话历史
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { MODEL, SUB_SYSTEM, openai } from "../config.js";
import { triggerPostToolUse, triggerPreToolUse } from "../hooks/index.js";
import { gray, magenta } from "../utils/colors.js";
import { toHistoryMessage } from "../utils/history.js";
import { extractText } from "../utils/messageText.js";
import { BASE_HANDLERS, BASE_TOOLS } from "./baseTools.js";

// 子 Agent 单次任务最多运行的轮数，防止无限循环
const MAX_ROUNDS = 30;

async function spawnSubagent(description: string): Promise<string> {
  console.log(magenta("\n[子 Agent 已启动]"));

  // 全新的消息历史，与父级的对话完全隔离，只以任务描述作为首条 user 消息
  const messages: ChatCompletionMessageParam[] = [{ role: "user", content: description }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: SUB_SYSTEM }, ...messages],
      tools: BASE_TOOLS,
      max_tokens: 8000,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("OpenAI 响应中没有 choices");
    }
    const assistant = choice.message;
    messages.push(toHistoryMessage(assistant));

    if (!assistant.tool_calls) {
      break;
    }

    for (const toolCall of assistant.tool_calls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || "{}");

      const blocked = await triggerPreToolUse(name, args);
      if (blocked !== null) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: blocked,
        });
        continue;
      }

      // 子 Agent 只能使用基础五个工具，不含 todo_write/task，未知工具名直接提示
      const handler = BASE_HANDLERS[name];
      const output = handler ? await handler(args) : `未知工具：${name}`;
      await triggerPostToolUse(name, args, output);
      console.log(gray(`  [sub] ${name}: ${output.slice(0, 100)}`));

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }

  // 优先取最后一条消息的文本内容作为结果
  const last = messages[messages.length - 1] as { content?: unknown; role?: string };
  let result = extractText(last.content);

  // 最后一条不是带文本的 assistant 消息时（比如卡在工具调用轮次上限），
  // 反向查找最近一条有内容的 assistant 消息
  if (!result) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i] as { content?: unknown; role?: string };
      if (message.role === "assistant") {
        result = extractText(message.content);
        if (result) {
          break;
        }
      }
    }
    if (!result) {
      result = "子 Agent 在 30 轮内未给出最终答案。";
    }
  }

  console.log(magenta("[子 Agent 完成]"));
  return result;
}

export async function runTask(args: Record<string, unknown>): Promise<string> {
  const description = args.description as string;
  return spawnSubagent(description);
}

// task 工具的 function-calling schema
export const taskToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "task",
    description: "启动子 Agent 处理复杂子任务。仅返回最终结论。",
    parameters: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
    },
  },
};
