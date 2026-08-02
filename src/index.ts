// CLI 入口文件，负责解析命令行参数并启动 agent
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startRepl } from "./repl.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 从 package.json 读取版本号，避免手动维护重复的版本字符串
const { version } = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
) as { version: string };

const program = new Command();

program
  .name("ccagent")
  .description("A TypeScript CLI coding agent")
  .version(version);

program.action(() => {
  void startRepl();
});

program.parse();
