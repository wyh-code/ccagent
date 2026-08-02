# HISTORY

每条变更记录包含：变更摘要 + 测试提示词（用于验证该次修改是否符合预期）。

## 0.1.0

### 初始化项目工程

- 变更摘要：使用 TypeScript + npm 搭建 CLI 工具骨架（`package.json`、`tsconfig.json`、`tsup` 构建、`eslint`/`prettier`、`vitest`），提供最小可运行的 CLI 入口 `src/index.ts`。
- 测试提示词：
  - `npm run build && node dist/index.js --version` —— 预期输出 `0.1.0`
  - `node dist/index.js` —— 预期打印占位提示语，进程正常退出

### 实现 Agent 核心循环与 bash 工具

- 变更摘要：新增 `config.ts`（环境变量与 OpenAI 客户端）、`agent.ts`（核心工具调用循环）、`repl.ts`（交互式 REPL）、`tools/bash.ts` + `tools/index.ts`（工具注册表，为后续新增工具预留结构）、`utils/colors.ts`（终端高亮）；`index.ts` 接入 `startRepl()` 作为默认命令。
- 测试提示词：
  - `printf "q\n" | node dist/index.js` —— 预期打印欢迎语后立即退出，退出码 0（验证 REPL 骨架，不依赖真实 API Key）
  - `node dist/index.js < /dev/null` —— 模拟 Ctrl+D，预期立即退出、不挂起
  - 配置好 `.env`（真实 `OPENAI_API_KEY`/`MODEL_ID`）后启动 `ccagent`，在 `s01 >>` 提示符下输入："列出当前目录下的所有文件" —— 预期模型调用 `bash` 工具执行类似 `ls` 的命令，终端打印黄色高亮的 `$ ls` 及命令输出，最终给出文字回答
  - 输入："当前目录下有几个 .ts 文件" —— 预期模型自行拼出 `find`/`ls` 一类命令统计数量并给出最终结论，验证多工具调用轮次能正常累积历史并结束循环
