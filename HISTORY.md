# HISTORY

每条变更记录包含：变更摘要，以及用于验证改动是否符合预期的内容——涉及 Agent/REPL 行为的改动列"试试这些 prompt："（自然语言 prompt 列表，直接喂给 REPL）；纯开发侧改动（构建、改名等，不涉及喂给 Agent 的对话）列"验证步骤："（每步把命令包进自然语言句子里）。

## 0.1.0

### 初始化项目工程

- 变更摘要：使用 TypeScript + npm 搭建 CLI 工具骨架（`package.json`、`tsconfig.json`、`tsup` 构建、`eslint`/`prettier`、`vitest`），提供最小可运行的 CLI 入口 `src/index.ts`。
- 验证步骤：
  - 跑一遍 `npm run build`，然后执行 `node dist/index.js --version`，确认能正常构建，且版本号输出 `0.1.0`
  - 直接执行 `node dist/index.js`，确认能打印占位提示语后进程正常退出

### 实现 Agent 核心循环与 bash 工具

- 变更摘要：新增 `config.ts`（环境变量与 OpenAI 客户端）、`agent.ts`（核心工具调用循环）、`repl.ts`（交互式 REPL）、`tools/bash.ts` + `tools/index.ts`（工具注册表，为后续新增工具预留结构）、`utils/colors.ts`（终端高亮）；`index.ts` 接入 `startRepl()` 作为默认命令。
- 验证步骤：
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认 REPL 骨架不依赖真实 API Key 也能立即退出（退出码 0）
  - 用 `node dist/index.js < /dev/null` 模拟 Ctrl+D 关闭输入流，确认 EOF 场景不会挂起
- 试试这些 prompt：
  - 列出当前目录下的所有文件
  - 当前目录下有几个 .ts 文件

### 新增 read_file/write_file/edit_file/glob 四个工具

- 变更摘要：对齐 `code.py` 的 s02 版本（工具从 1 个扩到 5 个）：新增 `utils/safePath.ts`（路径安全校验，拒绝解析后跑出工作区的路径）、`tools/readFile.ts`（支持 `limit` 截断）、`tools/writeFile.ts`（自动创建父目录）、`tools/glob.ts`（`noglobstar: true` 避免 `**` 递归匹配）、`tools/editFile.ts`；`tools/index.ts` 注册表补全四个新工具；`agent.ts` 打印方式从 bash 专属的 `$ command` 改成通用的 `> 工具名`；`config.ts` 的 `SYSTEM` 提示词改成"使用工具完成任务"；REPL 标题/提示符同步改成 s02。
- 验证步骤：
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s02，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 读取 README.md 文件，并告诉我这个项目是做什么的
  - 创建一个名为 test.txt 的文件，内容为 hello，然后再读取该文件
  - 查找当前目录下所有的 .ts 文件
  - 同时读取 README.md 和 package.json，然后生成一个总结文件
  - 把一段内容写到当前工作目录上一级的 evil.txt 里
