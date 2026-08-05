// 解析 Markdown 文件开头用 --- 包裹的 YAML frontmatter，返回元信息和正文
// 供技能文件（SKILL.md）和记忆文件共用

// 按给定字符裁掉字符串开头和结尾连续出现的部分
function stripChar(text: string, char: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === char) {
    start++;
  }
  while (end > start && text[end - 1] === char) {
    end--;
  }
  return text.slice(start, end);
}

export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  if (!text.startsWith("---")) {
    return { meta: {}, body: text };
  }
  const firstMarker = text.indexOf("---");
  const secondMarker = text.indexOf("---", firstMarker + 3);
  if (secondMarker === -1) {
    return { meta: {}, body: text };
  }

  const meta: Record<string, string> = {};
  const frontmatterBlock = text.slice(firstMarker + 3, secondMarker).trim();
  for (const line of frontmatterBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }
    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();
    meta[key] = stripChar(stripChar(rawValue, '"'), "'");
  }

  return { meta, body: text.slice(secondMarker + 3).trim() };
}
