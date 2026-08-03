// hooks/index.ts - 钩子注册表：把扩展逻辑从 agentLoop 里移出来，挂到各个事件上
//
//   用户输入问题
//        │
//        ▼
//   UserPromptSubmit ── 触发钩子，LLM 调用前
//        ▼
//   messages ──▶ LLM（有 tool_calls？）
//                  否 ──▶ Stop 钩子 ──▶ 退出
//                  是 ──▶ tool_call
//                          ▼
//                       PreToolUse：permissionHook / logHook
//                          │（未拦截）
//                       TOOL_HANDLERS[x]
//                          │
//                       PostToolUse：largeOutputHook
//                          ▼
//                       结果回写 messages
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { contextInjectHook } from "./contextInjectHook.js";
import { largeOutputHook } from "./largeOutputHook.js";
import { logHook } from "./logHook.js";
import { permissionHook } from "./permissionHook.js";
import { summaryHook } from "./summaryHook.js";

type PreToolUseHook = (
  name: string,
  args: Record<string, unknown>
) => Promise<string | null> | string | null;

type PostToolUseHook = (name: string, args: Record<string, unknown>, output: string) => void;

type StopHook = (
  messages: ChatCompletionMessageParam[]
) => Promise<string | null> | string | null;

type UserPromptSubmitHook = (query: string) => string;

const userPromptSubmitHooks: UserPromptSubmitHook[] = [];
const preToolUseHooks: PreToolUseHook[] = [];
const postToolUseHooks: PostToolUseHook[] = [];
const stopHooks: StopHook[] = [];

// PreToolUse：依次执行，只要有一个钩子返回非 null 的原因，立即短路并拦截这次工具调用
export async function triggerPreToolUse(
  name: string,
  args: Record<string, unknown>
): Promise<string | null> {
  for (const hook of preToolUseHooks) {
    const reason = await hook(name, args);
    if (reason !== null) {
      return reason;
    }
  }
  return null;
}

// PostToolUse：全部执行一遍，返回值不参与流程控制，纯粹是钩子的副作用（比如打印告警）
export async function triggerPostToolUse(
  name: string,
  args: Record<string, unknown>,
  output: string
): Promise<void> {
  for (const hook of postToolUseHooks) {
    hook(name, args, output);
  }
}

// Stop：模型不再调用工具、循环即将结束时触发；只要有一个钩子返回非 null 的字符串，
// 就把它当成新的用户消息追加进历史，让 agentLoop 继续跑下去，而不是真正退出
export async function triggerStop(messages: ChatCompletionMessageParam[]): Promise<string | null> {
  for (const hook of stopHooks) {
    const forced = await hook(messages);
    if (forced !== null) {
      return forced;
    }
  }
  return null;
}

// UserPromptSubmit：链式处理，每个钩子的返回值会替换当前 query 再传给下一个钩子
export function triggerUserPromptSubmit(query: string): string {
  let current = query;
  for (const hook of userPromptSubmitHooks) {
    current = hook(current);
  }
  return current;
}

userPromptSubmitHooks.push(contextInjectHook);
preToolUseHooks.push(permissionHook, logHook);
postToolUseHooks.push(largeOutputHook);
stopHooks.push(summaryHook);
