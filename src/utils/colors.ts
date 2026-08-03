// 终端 ANSI 高亮小工具，避免在业务代码里到处硬编码转义序列

export function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}

export function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

export function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

export function gray(text: string): string {
  return `\x1b[90m${text}\x1b[0m`;
}
