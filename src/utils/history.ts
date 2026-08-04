// 把 OpenAI 返回的消息对象转换成适合放进对话历史的普通对象
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

// SDK 返回的消息对象里，没有内容的字段会显式给 null（比如纯工具调用时 content/refusal
// 都是 null），直接塞进历史后续请求会把这些 null 字段原样带上；这里把它们过滤掉，
// 只保留真正有值的字段再放进对话历史
export function toHistoryMessage(message: ChatCompletionMessage): ChatCompletionMessageParam {
  const entries = Object.entries(message).filter(([, value]) => value !== null);
  return Object.fromEntries(entries) as ChatCompletionMessageParam;
}
