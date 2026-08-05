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
// 每次请求模型前还会先跑一遍上下文压缩管线（compact.ts），把历史控制在预算内。
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  compactHistory,
  estimateSize,
  isContextTooLongError,
  microCompact,
  reactiveCompact,
  snipCompact,
  toolResultBudget,
} from "./compact.js";
import { MODEL, openai } from "./config.js";
import { triggerPostToolUse, triggerPreToolUse, triggerStop } from "./hooks/index.js";
import { consolidateMemories, extractMemories, loadMemories } from "./memory.js";
import { getSystemPrompt, updateContext } from "./systemPrompt.js";
import { TOOL_HANDLERS, TOOLS } from "./tools/index.js";
import { cyan } from "./utils/colors.js";
import { toHistoryMessage } from "./utils/history.js";
import { messageText } from "./utils/messageText.js";

// 历史序列化后超过这个字符数就触发一次整段摘要
const CONTEXT_LIMIT = 50_000;

// 遇到"上下文过长"类请求异常时，最多做几次应急压缩重试
const MAX_REACTIVE_RETRIES = 1;

// 距离上一次调用 todo_write 已经过去的轮数，达到阈值就催促模型更新任务列表
let roundsSinceTodo = 0;
const TODO_REMINDER_ROUNDS = 3;

// 把 next 的内容原地写回 target，保持 target 这个数组引用不变
// （调用方持有的是同一个数组对象，直接整体重新赋值会丢失这层引用关系）
function replaceContents(
  target: ChatCompletionMessageParam[],
  next: ChatCompletionMessageParam[]
): void {
  const items = [...next];
  target.length = 0;
  target.push(...items);
}

export async function agentLoop(messages: ChatCompletionMessageParam[]): Promise<void> {
  let reactiveRetries = 0;

  while (true) {
    if (roundsSinceTodo >= TODO_REMINDER_ROUNDS && messages.length > 0) {
      messages.push({
        role: "user",
        content: "<reminder>请更新你的 todo 列表。</reminder>",
      });
      roundsSinceTodo = 0;
    }

    // 按当前运行时状态取（可能命中缓存的）系统提示词；记忆索引等内容变了才会重新拼装
    const context = updateContext();
    let system = getSystemPrompt(context);
    const memoriesContent = await loadMemories(messages);
    if (memoriesContent) {
      system += "\n\n" + memoriesContent;
    }

    // 压缩管线会修改/替换 messages，记忆提取要看的是压缩前的原始对话内容，
    // 所以在压缩管线跑之前先拍一份快照留到本轮结束时用
    const preCompress = messages.map((message) => ({
      role: message.role,
      content: messageText(message as { content?: unknown }),
    }));

    // 压缩管线：先便宜后昂贵——预算控制、裁剪、占位替换都不够时才整段摘要
    replaceContents(messages, toolResultBudget(messages));
    replaceContents(messages, snipCompact(messages));
    replaceContents(messages, microCompact(messages));
    if (estimateSize(messages) > CONTEXT_LIMIT) {
      console.log("[自动压缩]");
      replaceContents(messages, await compactHistory(messages));
    }

    let response;
    try {
      response = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: system }, ...messages],
        tools: TOOLS,
        max_tokens: 8000,
      });
      reactiveRetries = 0;
    } catch (error) {
      // 请求本身报"上下文过长"时，压缩管线显然没压够，做一次应急摘要再重试
      if (isContextTooLongError(error) && reactiveRetries < MAX_REACTIVE_RETRIES) {
        console.log("[响应式压缩]");
        replaceContents(messages, await reactiveCompact(messages));
        reactiveRetries += 1;
        continue;
      }
      throw error;
    }

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
      // 本轮真正结束时才提取新记忆、按需整理，压缩管线导致的中途重试不会触发
      await extractMemories(preCompress);
      await consolidateMemories();
      return;
    }

    // 本轮 assistant 发起了工具调用，计数器累加；调用 todo_write 会在下面重新清零
    roundsSinceTodo += 1;

    for (const toolCall of assistant.tool_calls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || "{}");
      console.log(cyan(`> ${name}`));

      // compact 没有注册在 TOOL_HANDLERS 里，直接在这里拦截处理：
      // 摘要整段历史后跳出本轮循环，回到 while 顶部重新走一遍压缩管线再请求模型
      if (name === "compact") {
        replaceContents(messages, await compactHistory(messages));
        break;
      }

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
