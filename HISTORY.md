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

- 变更摘要：工具从 1 个扩到 5 个：新增 `utils/safePath.ts`（路径安全校验，拒绝解析后跑出工作区的路径）、`tools/readFile.ts`（支持 `limit` 截断）、`tools/writeFile.ts`（自动创建父目录）、`tools/glob.ts`（`noglobstar: true` 避免 `**` 递归匹配）、`tools/editFile.ts`；`tools/index.ts` 注册表补全四个新工具；`agent.ts` 打印方式从 bash 专属的 `$ command` 改成通用的 `> 工具名`；`config.ts` 的 `SYSTEM` 提示词改成"使用工具完成任务"；REPL 标题/提示符更新为 s02。
- 验证步骤：
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s02，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 读取 README.md 文件，并告诉我这个项目是做什么的
  - 创建一个名为 test.txt 的文件，内容为 hello，然后再读取该文件
  - 查找当前目录下所有的 .ts 文件
  - 同时读取 README.md 和 package.json，然后生成一个总结文件
  - 把一段内容写到当前工作目录上一级的 evil.txt 里

## 0.3.0

### 新增三道权限门禁

- 变更摘要：新增 `permission.ts`，实现硬拒绝列表（`checkDenyList`，只针对 `bash`）、规则匹配（`checkRules`，`write_file`/`edit_file` 写到工作区外、`bash` 命令包含疑似破坏性关键字）、用户确认（`askUser`，终端 y/N 交互）三道门禁，串成 `checkPermission` 并接入 `agent.ts`——执行工具前先过门禁，被拒绝时把"权限被拒绝。"作为工具结果推入历史；`agent.ts` 里工具调用打印颜色从黄改成青；新增 `utils/colors.ts` 的 `red()`；`config.ts` 的 `SYSTEM` 提示词改成"所有破坏性操作需要用户批准"；REPL 标题/提示符更新为 s03。另外把 `repl.ts` 和 `permission.ts` 原本各自创建的 readline 接口合并成 `utils/stdin.ts` 里的一个全进程共享单例——同一个 stdin 上开两个 readline 接口会互相抢输入，合并后主循环和权限确认提示用的是同一个接口。
- 验证步骤：
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s03，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 执行 sudo apt update（应该被硬拒绝列表直接拦截，不会询问）
  - 帮我删除当前目录下的 old.txt 文件（应该命中破坏性命令规则，终端会暂停询问是否允许，输入 y 才会真的执行）
  - 把一段内容写到当前工作目录上一级的 outside.txt 里（应该命中"在工作区外写入"规则，终端会暂停询问）
  - 列出当前目录下的所有文件（不涉及任何危险操作，应该畅通无阻，不会有任何确认提示）

### 修复：assistant 历史消息带上了多余的 null 字段

- 变更摘要：`agent.ts` 之前把 SDK 返回的 assistant 消息对象原样塞进对话历史，但这个对象里没内容的字段是显式 `null`（纯工具调用时 `content`/`refusal` 都是 `null`），直接放进历史会导致后续每次请求都把这些 `null` 字段原样带给模型；新增 `toHistoryMessage()`，把值为 `null` 的字段过滤掉再放进历史，只保留真正有值的字段。用真实 `.env` 测试时发现同一句"执行 sudo apt update"会反复重试好几轮工具调用才停下；怀疑是历史里堆积的 `null` 字段让部分 OpenAI 兼容接口对会话状态的理解出现偏差，导致模型没有正确识别出"自己已经调用过、已经被拒绝了"，从而继续尝试——具体是否是这个原因造成需要你本地实测确认，但这个改动本身是一个独立成立的修复，不管是不是这次现象的成因都需要做。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认 REPL 骨架行为不受影响
- 试试这些 prompt：
  - 执行 sudo apt update（用真实 `.env` 跑，对比这次是否还是一次询问/拦截就停止，还是依然会反复重试多轮工具调用）

## 0.4.0

### 新增钩子系统，权限逻辑改为挂在 PreToolUse 上

- 变更摘要：新增 `hooks/` 目录，`hooks/index.ts` 提供 `PreToolUse`/`PostToolUse`/`Stop`/`UserPromptSubmit` 四类事件的注册表和触发函数（`PreToolUse`/`Stop` 按注册顺序短路——遇到第一个返回非空结果的钩子就停；`PostToolUse` 全部执行、返回值不参与流程；`UserPromptSubmit` 链式处理，字符串返回值替换当前 query 再传给下一个钩子）；把原来 `permission.ts` 的门禁逻辑迁移改写成 `hooks/permissionHook.ts`（`PreToolUse`，返回值从布尔改成"拦截原因字符串或 null"，硬拒绝列表去掉了 `> /dev/sda`）；新增 `hooks/logHook.ts`（`PreToolUse`，打印调用日志，注册在 `permissionHook` 之后，所以被拦截的调用不会留日志）、`hooks/largeOutputHook.ts`（`PostToolUse`，输出超 10 万字符告警）、`hooks/contextInjectHook.ts`（`UserPromptSubmit`，把工作目录注入 prompt 前面）、`hooks/summaryHook.ts`（`Stop`，打印本轮工具调用次数）。`agent.ts` 去掉了原来固定打印的 `> {name}`（这个职责现在由 `logHook` 承担，且只在放行时才打印）；无 `tool_calls` 时改为先触发 `Stop` 钩子，返回非空字符串就当成新的用户消息继续循环，而不是直接结束。`config.ts` 的 `SYSTEM` 提示词改回"使用工具完成任务。直接行动，不要解释。"，新增 `TEXT_ENCODING` 常量并在 `bash.ts`/`readFile.ts`/`writeFile.ts`/`editFile.ts` 里统一引用，替换掉散落的 `"utf-8"` 字面量。`repl.ts` 在退出判断之后、写入历史之前调用 `triggerUserPromptSubmit`。顺带修了一个遗漏：`tools/bash.ts` 里一直留着 `run_bash` 内部自己的危险命令拦截（`DANGEROUS_PATTERNS`），这类检查应该完全交给权限层——已删除，改成完全依赖 `permissionHook` 把关。另外把 `safePath.ts` 里判断路径是否越界的逻辑拆出一个不抛错的 `isOutsideWorkdir()`，供 `permissionHook.ts` 和 `glob.ts` 共用，不用各自重复实现一遍。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s04，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 列出当前目录下的所有文件（应该先看到一行 `[HOOK] UserPromptSubmit：注入工作目录 ...`，再看到 `[HOOK] bash(...)`，然后正常执行不会有确认提示）
  - 当前目录下新建old.txt文件
  - 执行 sudo apt update（应该被硬拒绝列表直接拦截，只有 ⛔ 提示，没有 `[HOOK] bash(...)` 那行日志，因为日志钩子排在权限钩子后面、被拦截时不会执行到）
  - 帮我删除当前目录下的 old.txt 文件（应该命中破坏性命令规则，暂停询问 y/N；输入 y 放行的话，放行之后应该能看到 `[HOOK] bash(...)` 日志）
  - 随便问一个不需要用工具就能回答的问题（比如"你是谁"），回答结束后应该能看到一行 `[HOOK] Stop：本次会话共使用 0 次工具调用`

## 0.5.0

### 新增 todo_write 工具与催促提醒机制

- 变更摘要：工具从 5 个扩到 6 个：新增 `tools/todoWrite.ts`，内部用模块级变量维护当前任务列表（不落盘），每次调用整体校验（每项必须有 `content` 和状态取值合法的 `status`）并覆盖列表，按状态着色打印任务清单（等待中/处理中/已完成）；`tools/index.ts` 注册表补上这个新工具；`utils/colors.ts` 新增 `green()`。`agent.ts` 新增 `roundsSinceTodo` 计数器：每轮只要 assistant 发起了工具调用就 +1，调用的是 `todo_write` 就清零，达到 3 轮时在下一轮开始前往历史里插入一条 `<reminder>请更新你的 todo 列表。</reminder>` 提醒消息并重新清零。`config.ts` 的 `SYSTEM` 提示词加上"开始多步骤任务前先用 todo_write 规划步骤"的指引；REPL 标题/提示符更新为 s05。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s05，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 帮我规划一下：先创建一个 hello.txt 文件写入 hello，再读取它，请先用 todo_write 列出这两步任务再执行（应该先看到任务清单按等待中/处理中/已完成变化打印，最后完成两步操作）
  - 连续问三个不需要用到 todo_write 的简单问题（比如依次问"你是谁""1+1 等于几""现在用的是什么模型"），第三次回答之后下一轮应该会看到历史里被插入催促更新 todo 列表的提醒
  - 直接问一句"你是谁"，确认不调用任何工具也能正常回答，不会被强行要求先规划
