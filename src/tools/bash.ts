// bash 工具：在工作区目录下执行一条 shell 命令，并把输出回传给模型
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { WORKDIR } from "../config.js";

const execAsync = promisify(exec);

// 始终拦截的危险命令关键字
const DANGEROUS_PATTERNS = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"];

// 单条命令最长执行时间
const TIMEOUT_MS = 120_000;

// 输出缓冲区上限：调大到 10MB，避免正常命令的输出被 Node 默认 1MB 缓冲区提前截断报错
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

// 最终回传给模型的输出最多保留的字符数
const MAX_OUTPUT_CHARS = 50_000;

// 截断合并后的输出，空输出时给出提示文案
function formatOutput(stdout: string, stderr: string): string {
  const merged = (stdout + stderr).trim();
  return merged ? merged.slice(0, MAX_OUTPUT_CHARS) : "（无输出）";
}

export async function runBash(args: Record<string, unknown>): Promise<string> {
  const command = args.command as string;

  if (DANGEROUS_PATTERNS.some((pattern) => command.includes(pattern))) {
    return "错误：危险命令已被拦截";
  }

  try {
    // exec 默认按 UTF-8 解码输出，遇到非法字节会用替换字符处理
    const { stdout, stderr } = await execAsync(command, {
      cwd: WORKDIR,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
    });
    return formatOutput(stdout, stderr);
  } catch (error) {
    // Node 在子进程以非零退出码结束时也会走到这里，但 error 上仍带着完整的
    // stdout/stderr —— 这种情况不算失败，跟成功路径一样合并输出返回即可
    if (isExecError(error)) {
      if (error.killed) {
        return "错误：超时（120 秒）";
      }
      if (typeof error.stdout === "string" || typeof error.stderr === "string") {
        return formatOutput(error.stdout ?? "", error.stderr ?? "");
      }
      return `错误：${error.message}`;
    }
    return `错误：${String(error)}`;
  }
}

// 判断捕获到的异常是否是 child_process 抛出的 ExecException 结构
function isExecError(
  error: unknown
): error is Error & { killed?: boolean; stdout?: string; stderr?: string } {
  return error instanceof Error;
}

// bash 工具的 function-calling schema，交给模型用于判断何时调用
export const bashToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "bash",
    description: "执行一条 shell 命令。",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
};
