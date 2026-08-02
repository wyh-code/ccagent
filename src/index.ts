// CLI 入口文件，负责解析命令行参数并启动 agent
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  // 占位实现，后续会替换为完整的 agent 交互循环
  console.log("ccagent 已初始化，agent 逻辑待实现。");
});

program.parse();
