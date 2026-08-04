// compact.ts - 上下文压缩管线：在每次请求模型前，按"先便宜后昂贵"的顺序
// 依次跑过预算控制/裁剪/占位替换，超限时再退化到整段摘要
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MODEL, TEXT_ENCODING, WORKDIR, openai } from "./config.js";

// 会话转录（压缩前的完整历史备份）落盘目录
export const TRANSCRIPT_DIR = join(WORKDIR, ".transcripts");

// 超大工具结果落盘目录
export const TOOL_RESULTS_DIR = join(WORKDIR, ".task_outputs", "tool-results");

// microCompact 保留最近几条工具结果的完整内容，更早的替换成占位符
const KEEP_RECENT = 3;

// 单条工具结果超过这个长度就落盘，只在历史里留预览
const PERSIST_THRESHOLD = 30_000;

// 粗略估算消息历史序列化后的字符数，用作是否需要整段摘要的判断依据
export function estimateSize(messages: ChatCompletionMessageParam[]): number {
  return JSON.stringify(messages).length;
}

type LooseMessage = ChatCompletionMessageParam & {
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

// 判断一条消息是不是"待响应的 tool_calls" assistant 消息——紧跟在它后面的 tool 结果
// 消息都要和它绑在一起当成一个整体，裁剪时只能整体保留或整体丢弃，不能从中间切开
// （否则会留下没有对应工具结果的 tool_calls，OpenAI 兼容接口会直接拒绝这次请求）
function startsToolCallGroup(message: ChatCompletionMessageParam): boolean {
  const toolCalls = (message as LooseMessage).tool_calls;
  return message.role === "assistant" && Array.isArray(toolCalls) && toolCalls.length > 0;
}

// 按"工具调用绑定关系"分组：一条带 tool_calls 的 assistant 消息 + 它后面紧跟的所有
// tool 结果消息算一组，其余消息各自单独成组
function groupByToolCallBoundary(
  messages: ChatCompletionMessageParam[]
): ChatCompletionMessageParam[][] {
  const groups: ChatCompletionMessageParam[][] = [];
  let expectingToolResults = false;
  for (const message of messages) {
    if (expectingToolResults && message.role === "tool") {
      groups[groups.length - 1]?.push(message);
      continue;
    }
    groups.push([message]);
    expectingToolResults = startsToolCallGroup(message);
  }
  return groups;
}

// 从末尾开始按组累加消息直到接近预算，整组保留、不切断；第一组（最靠后的一组）
// 无论多大都会被保留，保证至少能取到点东西、不会因为单组过大而卡在原地不动
function takeGroupsFromEnd(
  groups: ChatCompletionMessageParam[][],
  budget: number,
  stopBeforeIndex = 0
): ChatCompletionMessageParam[][] {
  const kept: ChatCompletionMessageParam[][] = [];
  let count = 0;
  for (let i = groups.length - 1; i >= stopBeforeIndex; i--) {
    const group = groups[i];
    if (!group) continue;
    if (count > 0 && count + group.length > budget) break;
    kept.unshift(group);
    count += group.length;
  }
  return kept;
}

// L1：消息条数超过上限时，裁掉中间一段，只保留开头几组和结尾一段；分组是为了不切断
// 某次工具调用和它的响应，如果头尾预算已经覆盖了全部分组（比如单组本身就很大），
// 就没有可裁剪的中间部分，原样返回
export function snipCompact(
  messages: ChatCompletionMessageParam[],
  maxMessages = 50
): ChatCompletionMessageParam[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const groups = groupByToolCallBoundary(messages);
  const keepHeadBudget = 3;
  const keepTailBudget = maxMessages - 3;

  const headGroups: ChatCompletionMessageParam[][] = [];
  let headCount = 0;
  for (const group of groups) {
    if (headCount > 0 && headCount + group.length > keepHeadBudget) break;
    headGroups.push(group);
    headCount += group.length;
  }

  const tailGroups = takeGroupsFromEnd(groups, keepTailBudget, headGroups.length);
  if (headGroups.length + tailGroups.length >= groups.length) {
    return messages;
  }

  const head = headGroups.flat();
  const tail = tailGroups.flat();
  const snipped = messages.length - head.length - tail.length;

  return [
    ...head,
    { role: "user", content: `[已裁剪 ${snipped} 条消息]` },
    ...tail,
  ];
}

// 收集所有 role 为 tool 的消息及其在数组中的下标
function collectToolMessages(messages: ChatCompletionMessageParam[]): number[] {
  return messages.reduce<number[]>((indices, message, index) => {
    if (message.role === "tool") {
      indices.push(index);
    }
    return indices;
  }, []);
}

// L2：把较早的工具结果替换成占位符，只保留最近几条的完整内容
export function microCompact(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  const toolIndices = collectToolMessages(messages);
  if (toolIndices.length <= KEEP_RECENT) {
    return messages;
  }
  for (const index of toolIndices.slice(0, -KEEP_RECENT)) {
    const message = messages[index] as LooseMessage;
    const content = String(message.content ?? "");
    if (content.length > 120) {
      message.content = "[较早的工具结果已压缩。需要时请重新运行。]";
    }
  }
  return messages;
}

// 工具输出过大时落盘保存，对话历史里只留一份预览
function persistLargeOutput(toolCallId: string, output: string): string {
  if (output.length <= PERSIST_THRESHOLD) {
    return output;
  }
  mkdirSync(TOOL_RESULTS_DIR, { recursive: true });
  const path = join(TOOL_RESULTS_DIR, `${toolCallId}.txt`);
  if (!existsSync(path)) {
    writeFileSync(path, output, TEXT_ENCODING);
  }
  return `<persisted-output>\n完整输出：${path}\n预览：\n${output.slice(0, 2000)}\n</persisted-output>`;
}

// L3：工具结果总体积超过预算时，优先把最大的几条落盘，历史里只留预览
export function toolResultBudget(
  messages: ChatCompletionMessageParam[],
  maxBytes = 200_000
): ChatCompletionMessageParam[] {
  const indices = collectToolMessages(messages);
  if (indices.length === 0) {
    return messages;
  }

  const contentLength = (index: number): number =>
    String((messages[index] as LooseMessage).content ?? "").length;

  let total = indices.reduce((sum, index) => sum + contentLength(index), 0);
  if (total <= maxBytes) {
    return messages;
  }

  const ranked = [...indices].sort((a, b) => contentLength(b) - contentLength(a));
  for (const index of ranked) {
    if (total <= maxBytes) {
      break;
    }
    const message = messages[index] as LooseMessage;
    const content = String(message.content ?? "");
    if (content.length <= PERSIST_THRESHOLD) {
      continue;
    }
    const toolCallId = message.tool_call_id ?? "unknown";
    message.content = persistLargeOutput(toolCallId, content);
    total = indices.reduce((sum, i) => sum + contentLength(i), 0);
  }
  return messages;
}

// 把当前完整消息历史落盘成一份 JSONL 转录文件，供压缩前留档
function writeTranscript(messages: ChatCompletionMessageParam[]): string {
  mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  const path = join(TRANSCRIPT_DIR, `transcript_${Math.floor(Date.now() / 1000)}.jsonl`);
  const lines = messages.map((message) => JSON.stringify(message));
  writeFileSync(path, lines.length > 0 ? lines.join("\n") + "\n" : "", TEXT_ENCODING);
  return path;
}

// 请求模型对整段历史做一次摘要，用于压缩后继续对话
async function summarizeHistory(messages: ChatCompletionMessageParam[]): Promise<string> {
  const conversation = JSON.stringify(messages).slice(0, 80_000);
  const prompt =
    "总结以下编程 Agent 对话，以便继续工作。\n" +
    "保留：1. 当前目标 2. 关键发现/决策 3. 读/改过的文件 4. 剩余工作 5. 用户约束。\n简洁但具体。\n\n" +
    conversation;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message.content ?? "";
  return content.trim() || "（空摘要）";
}

// L4：用模型摘要整段历史，把消息数组彻底替换成一条摘要消息
export async function compactHistory(
  messages: ChatCompletionMessageParam[]
): Promise<ChatCompletionMessageParam[]> {
  const transcriptPath = writeTranscript(messages);
  console.log(`[转录已保存: ${transcriptPath}]`);
  const summary = await summarizeHistory(messages);
  return [{ role: "user", content: `[已压缩]\n\n${summary}` }];
}

// 应急压缩：模型直接报上下文过长时使用，摘要之外额外保留最近几条原始消息
// （按分组取，避免把最后一次工具调用和它的响应从中间切开）
export async function reactiveCompact(
  messages: ChatCompletionMessageParam[]
): Promise<ChatCompletionMessageParam[]> {
  writeTranscript(messages);
  const summary = await summarizeHistory(messages);
  const recent = takeGroupsFromEnd(groupByToolCallBoundary(messages), 5).flat();
  return [{ role: "user", content: `[响应式压缩]\n\n${summary}` }, ...recent];
}

// 上下文过长类错误的关键词特征，用于判断请求异常是否需要触发应急压缩
const CONTEXT_TOO_LONG_MARKERS = [
  "prompt_too_long",
  "too many tokens",
  "context_length",
  "maximum context",
  "context window",
];

// 判断一次请求异常是否属于"上下文过长"这一类
export function isContextTooLongError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return CONTEXT_TOO_LONG_MARKERS.some((marker) => message.includes(marker));
}
