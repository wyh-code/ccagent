// 从消息的 content 字段中提取纯文本：字符串原样返回，null/undefined 返回空字符串，
// 其余类型（比如结构化的多段内容）转成字符串兜底
export function extractText(content: unknown): string {
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  return String(content);
}

// 从一条完整消息对象中取出它的文本内容
export function messageText(message: { content?: unknown }): string {
  return extractText(message.content);
}
