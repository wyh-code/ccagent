// repl.ts - 交互式命令行循环
// 对应原 __main__ 入口：不断读取用户输入，驱动 agentLoop 完成一轮对话
import { createInterface } from "node:readline/promises";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { agentLoop } from "./agent.js";
import { cyan } from "./utils/colors.js";

const EXIT_COMMANDS = new Set(["q", "exit", ""]);

export async function startRepl(): Promise<void> {
  console.log("s01：Agent 循环");
  console.log("输入问题，回车发送。输入 q 退出。\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C 触发 SIGINT 时优雅退出，对应 Python 里的 KeyboardInterrupt
  let interrupted = false;
  rl.on("SIGINT", () => {
    interrupted = true;
    rl.close();
  });

  const history: ChatCompletionMessageParam[] = [];

  while (!interrupted) {
    let query: string;
    try {
      query = await rl.question(cyan("s01 >> "));
    } catch {
      // 输入流关闭（如 Ctrl+D）时 question() 会被拒绝，对应 Python 的 EOFError
      break;
    }

    if (EXIT_COMMANDS.has(query.trim().toLowerCase())) {
      break;
    }

    history.push({ role: "user", content: query });
    await agentLoop(history);

    const final = history[history.length - 1];
    if (final?.role === "assistant" && typeof final.content === "string" && final.content) {
      console.log(final.content);
    }
    console.log();
  }

  rl.close();
}
