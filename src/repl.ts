// repl.ts - 交互式命令行循环：不断读取用户输入，驱动 agentLoop 完成一轮对话
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { agentLoop } from "./agent.js";
import { cyan } from "./utils/colors.js";
import { closeStdin, getStdin } from "./utils/stdin.js";

const EXIT_COMMANDS = new Set(["q", "exit", ""]);

export async function startRepl(): Promise<void> {
  console.log("s03：权限系统");
  console.log("输入问题，回车发送。输入 q 退出。\n");

  const rl = getStdin();
  // Ctrl+C 触发 SIGINT 时优雅退出交互循环
  let interrupted = false;
  rl.on("SIGINT", () => {
    interrupted = true;
    rl.close();
  });

  const history: ChatCompletionMessageParam[] = [];

  while (!interrupted) {
    let query: string;
    try {
      query = await rl.question(cyan("s03 >> "));
    } catch {
      // 输入流关闭（如 Ctrl+D）时 question() 返回的 Promise 会被 reject
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

  closeStdin();
}
