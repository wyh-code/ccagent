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

## 0.6.0

### 新增 task 工具，支持派生上下文隔离的子 Agent

- 变更摘要：工具从 6 个扩到 7 个：新增 `tools/task.ts`，实现 `task` 工具——用一份全新的 `messages[]` 派生子 Agent，子 Agent 内部完整的多轮工具调用过程对父级不可见，只把最后一段摘要文本带回父级历史；子 Agent 最多运行 30 轮，用独立的 `SUB_SYSTEM` 提示词（"完成任务后给摘要，不要继续委派"），工具集限定为基础五个（`bash`/`read_file`/`write_file`/`edit_file`/`glob`），不含 `todo_write`/`task` 本身，防止递归派生；子 Agent 内部的工具调用仍会触发全局 `PreToolUse`/`PostToolUse` 钩子，但不触发 `UserPromptSubmit`/`Stop`。为了让 `task.ts` 和 `agent.ts` 都能复用同一份"基础五个工具"清单，新增 `tools/baseTools.ts`（`BASE_TOOLS`/`BASE_HANDLERS`）和 `tools/types.ts`（抽出原来在 `tools/index.ts` 里定义的 `ToolHandler` 类型），`tools/index.ts` 现在是把 `BASE_TOOLS`/`BASE_HANDLERS` 加上 `todo_write`/`task` 拼起来；同时把 `agent.ts` 里原本内联的 `toHistoryMessage()`（把 SDK 返回的消息对象转换成能塞进历史的对象，过滤掉值为 `null` 的字段）提取成 `utils/history.ts`，供 `agent.ts` 和 `task.ts` 共用，避免子 Agent 循环里重复实现一遍同样的转换逻辑。`config.ts` 的 `SYSTEM` 提示词加上"遇到复杂子问题时，使用 task 工具派生子 Agent"，并把原来"执行过程中及时更新状态"那半句去掉；新增 `SUB_SYSTEM` 常量。`tools/todoWrite.ts` 打印任务清单的图标从文字标签（等待中/处理中/已完成）改成符号（留空/青色 ▸/绿色 ✓）。`utils/colors.ts` 新增 `magenta()`，用于子 Agent 启动/完成的提示行。REPL 标题/提示符更新为 s06。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s06，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 请使用 task 工具派生一个子 Agent，让它创建一个名为 sub_hello.txt 的文件，内容为 hello from subagent，然后读取确认内容（应该看到 `[子 Agent 已启动]`、子 Agent 内部的工具调用日志、`[子 Agent 完成]`，最后父级只拿到一段摘要文本，父级历史里不会出现子 Agent 内部逐条的工具调用消息）
  - 用 task 派生一个子 Agent 去数一下当前目录有多少个 .ts 文件，同时自己也创建一个 todo 列表规划这个任务（观察 todo_write 和 task 可以在同一轮对话里配合使用）
  - 让子 Agent 尝试执行 sudo apt update（应该看到子 Agent 内部的工具调用同样被硬拒绝列表拦截，说明子 Agent 也受同一套权限钩子约束）

## 0.7.0

### 新增 load_skill 工具与技能目录，实现两级按需知识注入

- 变更摘要：工具从 7 个扩到 8 个：新增 `src/skills.ts`，进程启动时扫描工作目录下的 `skills/` 子目录，把每个含 `SKILL.md` 的子目录解析成一个技能（解析文件开头 `---` 包裹的 YAML frontmatter 取 `name`/`description`，缺失时分别退回目录名和正文首行去掉井号），登记进 `SKILL_REGISTRY`，并提供 `listSkills()` 汇总成"名称 + 一行描述"的目录文本；新增 `tools/loadSkill.ts` 实现 `load_skill` 工具，按名称从注册表取出对应技能的完整 `SKILL.md` 内容通过工具结果回传给模型，找不到时返回"未找到技能：xxx"。这样技能目录常驻在 `SYSTEM` 里（每个技能只占一行的 token 开销），完整内容只有模型主动调用 `load_skill` 才会被注入进对话，避免一开始就把所有技能的完整文档都塞进提示词。为了让 `SYSTEM` 能引用技能目录又不产生 `config.ts`/`skills.ts` 相互引用的循环依赖，把原来定义在 `config.ts` 里的 `SYSTEM` 常量拆到新文件 `src/systemPrompt.ts`（依赖顺序变成 `systemPrompt.ts → skills.ts → config.ts`，`config.ts` 本身不再依赖任何业务模块），提示词内容额外加上"可用技能"目录和"需要完整说明时使用 load_skill 加载"的指引，其余部分不变；`config.ts` 现在只保留 `SUB_SYSTEM`（子 Agent 不需要看到技能目录，用的还是原来的固定文案）。`tools/index.ts` 把 `load_skill` 加进 `TOOLS`/`TOOL_HANDLERS`。REPL 标题/提示符更新为 s07。另外新增两个示例技能目录 `skills/code-review-checklist/SKILL.md`（提交前要跑的检查清单：typecheck/lint/build/test/冷启动冒烟/依赖方向检查/README-HISTORY 同步）和 `skills/history-entry/SKILL.md`（如何按本项目约定写 `HISTORY.md` 条目），两者都是本项目实际会用到的说明文档而不是占位内容，方便验证 `SKILL_REGISTRY`/`load_skill` 的真实效果。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s07，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 你有哪些可用技能？请列出名称和描述，不要加载（应该不触发任何工具调用，直接从 SYSTEM 里的目录报出 `code-review-checklist` 和 `history-entry` 两个技能）
  - 请使用 load_skill 加载 code-review-checklist，然后按里面的清单检查一下当前项目（应该看到 `[HOOK] load_skill(...)` 和 `[技能] 已加载 code-review-checklist` 两行日志，随后模型基于完整清单内容逐项检查）
  - 请调用 load_skill 加载一个不存在的技能，名字随便起一个，然后把结果原样告诉我（应该看到工具返回"未找到技能：xxx"，不会报错崩溃）

## 0.8.0

### 新增四层上下文压缩管线与 compact 工具

- 变更摘要：工具从 8 个扩到 9 个：新增 `src/compact.ts`，实现四层压缩管线（原则是先便宜后昂贵）——`toolResultBudget`（L1：工具结果总长度超 200,000 字符时，把最大的几条落盘到 `.task_outputs/tool-results/`，历史里只留路径 + 前 2000 字符预览）、`snipCompact`（L2：消息条数超过 50 条时只保留开头几条和结尾一段，中间替换成"[已裁剪 N 条消息]"提示）、`microCompact`（L3：超过 120 字符的较早工具结果——除最近 3 条外——替换成占位符）、`compactHistory`（L4：历史序列化后仍超过 50,000 字符时，先把完整历史落盘为 `.transcripts/` 下的 JSONL 转录备份，再请求模型生成一段摘要，用这条摘要消息整体替换掉原历史）；另有 `reactiveCompact`（应急：摘要 + 保留最近几条原始消息）和 `isContextTooLongError`（按关键词识别"上下文过长"类错误）。新增 `tools/compact.ts` 只放 `compact` 工具的 schema（`focus` 参数可选）——这个工具刻意不注册进 `TOOL_HANDLERS`，因为它需要能整体替换消息数组，不适合套用"返回字符串塞进 tool 消息"这套通用工具的模式；`agentLoop` 在打印 `> {name}` 之后、派发到 `TOOL_HANDLERS` 之前专门检查 `name === "compact"`，命中就直接调用 `compactHistory` 并跳出这一轮的工具循环。`agent.ts` 现在每次请求模型前都会依次跑 L1→L2→L3，序列化后仍超预算再触发 L4；用一个 `replaceContents()` 小工具把压缩结果写回调用方传入的同一个数组对象（不能直接重新赋值参数，那样只是换掉本地变量，调用方持有的数组引用不会跟着变）；请求模型这一步包了 try/catch，命中 `isContextTooLongError` 且应急重试次数（上限 1 次）没用完时，做一次 `reactiveCompact` 后 `continue` 重试，其余异常原样抛出（不会在 REPL 里被兜底，非上下文类的请求异常会直接让进程退出）。`args = JSON.parse(toolCall.function.arguments)` 在 `agent.ts` 和 `task.ts` 里都改成 `... || "{}"`，因为 `compact` 的参数全部可选，模型调用时可能传空字符串。`systemPrompt.ts` 的提示词文案追加了"上下文过长时可使用 compact 工具"这一句，`task`/`todo_write` 相关的原有指引保留不动。REPL 标题/提示符更新为 s08。`.gitignore` 新增 `.transcripts/`、`.task_outputs/`（运行期生成的目录，不入库）。
- 本次改动只新增压缩机制本身，不涉及其他功能：`hooks/permissionHook.ts` 的破坏性关键词确认与越界写入确认、`hooks/index.ts`/`hooks/summaryHook.ts` 的 `Stop` 事件与工具调用次数摘要、`agent.ts` 里的 `roundsSinceTodo` 催促计数器均保持不变。
- 额外发现并修复的问题：实测（用一个连续发起十几次工具调用的会话）发现 `snipCompact`/`reactiveCompact` 按下标做朴素切片/取尾操作时，如果切点或截取范围刚好落在"一条带 `tool_calls` 的 assistant 消息"和"它对应的 `tool` 响应消息"中间，会把两者拆开，产生一条没有配对响应的 `tool_calls`，下一次请求直接被 OpenAI 兼容接口拒绝（`400 ... insufficient tool messages following tool_calls`），整个进程崩溃退出——这不是极端边界情况，正常使用中模型一次发起十几个工具调用并不罕见。`src/compact.ts` 新增 `groupByToolCallBoundary()`（把"assistant(tool_calls) + 紧跟的 tool 响应"打包成一组，其余消息各自成组）和 `takeGroupsFromEnd()`（从末尾按组累加，整组保留不切断），`snipCompact` 和 `reactiveCompact` 都改成基于分组裁剪/截取，保证任何裁剪结果都不会把某次工具调用和它的响应拆开；代价是极端情况下（单个分组本身就超过预算）可能没法把消息数精确压到目标以内，但比让进程崩溃更安全。用一段合成的 60 条消息（30 组 assistant-tool_calls/tool 响应对）跑过 `snipCompact`，确认裁剪后所有分组边界完整；又用一次真实会话发起 30+ 次工具调用（远超 50 条消息阈值）验证不再崩溃。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s08，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 列出当前目录下的文件（正常路径回归，确认能看到 `> bash` 这一行青色提示，紧跟着 `[HOOK] bash(...)` 日志）
  - 执行 sudo apt update（应该仍被硬拒绝列表直接拦截，不弹确认）；帮我删除当前目录下一个真实存在的临时文件（应该仍命中破坏性命令规则，暂停询问 y/N，这一点没有回退）
  - 请直接调用 compact 工具，对当前对话历史做一次摘要压缩（应该看到 `> compact`、`[转录已保存: .transcripts/transcript_xxx.jsonl]`，随后模型基于摘要继续回答；可以用"读取 .transcripts 目录下最新的转录文件，告诉我里面有几行"验证转录文件确实写入了）
  - 请使用 task 工具派生一个子 Agent，计算 23 加 19 等于多少（回归验证子 Agent 不受这次改动影响：不会经过压缩管线，也不会触发 compact）
  - 让它连续执行十几条不同的 echo 命令（比如"依次执行 echo 1 到 echo 20，每条都告诉我结果"），确认消息数超过 50 后不会崩溃退出

## 0.9.0

### 新增跨会话持久化记忆机制

- 变更摘要：新增 `src/memory.ts`，实现一套背景运行（不经过 `TOOL_HANDLERS`，不是模型主动调用的工具）的记忆系统：`.memory/` 目录进程启动时自动创建，`MEMORY.md` 是索引文件（每条记忆一行 `- [name](文件名) — 描述`），其余每个 `.md` 是一条记忆（YAML frontmatter 存 `name`/`description`/`type`，正文是 Markdown 详情）。`writeMemoryFile()` 写入单条记忆后立即调用内部的 `rebuildIndex()` 重建索引；`readMemoryIndex()` 读索引供 `SYSTEM` 常驻展示；`listMemoryFiles()` 列出并解析所有记忆；`selectRelevantMemories()` 拿最近几条用户消息去请求模型，从记忆目录里挑出明显相关的几条索引（用非贪婪正则 `/\[.*?\]/s` 从模型回复里抠出 JSON 数组），LLM 调用失败或没解析出结果时退回关键词匹配兜底；`loadMemories()` 把选中记忆的完整正文包进 `<relevant_memories>` 标签；`extractMemories()` 在每轮真正结束时，把最近 10 条消息整理成对话文本请求模型提取新记忆（用贪婪正则 `/\[.*\]/s`，和 `selectRelevantMemories` 的非贪婪版本不同），只有 `description`/`body` 都非空的条目才会真正写入；`consolidateMemories()` 在记忆数达到 10 条时，把所有记忆内容打包请求模型合并/去重/裁剪到 30 条以内。为了让 `SYSTEM` 里的记忆索引跟着对话推进保持最新，把 `systemPrompt.ts` 原来"模块加载时算一次存成常量"的 `SYSTEM` 改成了每次调用都重新拼一次的 `buildSystemPrompt()` 函数，`agent.ts` 主循环里每轮开头都重新调用它，再用 `loadMemories(messages)` 的结果按需追加到这一轮的 system 文本末尾（不是塞进 messages 数组，只影响这一轮请求，不进历史）。`agent.ts` 在压缩管线开始跑之前，先把当前 `messages` 转换成一份 `{role, content}` 的简化快照（`preCompress`），压缩管线会修改/替换 `messages` 本身，记忆提取要看的是压缩前的原始内容；只有真正走到"本轮结束、不是 Stop 钩子强制续聊"的分支时，才会 `await extractMemories(preCompress)` 和 `await consolidateMemories()`。抽出两个共享工具函数减少重复：`utils/frontmatter.ts`（原来只在 `skills.ts` 里的 `parseFrontmatter`，现在技能文件和记忆文件解析共用）、`utils/messageText.ts`（原来在 `tools/task.ts` 里私有的 `extractText`，现在子 Agent 摘要提取和记忆系统的对话文本提取共用）。`.gitignore` 新增 `.memory/`（运行期生成的用户数据，不随代码分发）。REPL 标题/提示符更新为 s09。
- 本次改动只新增记忆机制本身，不涉及其他功能：子 Agent 继续使用完整的基础工具集（`bash`/`read_file`/`write_file`/`edit_file`/`glob`）并保留 `PreToolUse`/`PostToolUse` 钩子触发；权限硬拒绝列表保留 6 个关键词（`rm -rf /`/`sudo`/`shutdown`/`reboot`/`mkfs`/`dd if=`）；日志钩子继续打印调用参数预览。
- 额外发现并修复的问题：`consolidateMemories()` 在成功解析出模型返回的合并结果后，会先检查结果是否为非空数组，只有非空时才删除现有记忆文件并写入新内容——避免模型返回空数组时（比如输出被截断）把全部记忆清空且没有任何东西写回来。
- 验证步骤：
  - 依次跑 `npm run typecheck`、`npm run lint`、`npm run build`，确认改动没有破坏类型/lint
  - 用 `printf "q\n" | node dist/index.js` 模拟输入 q 直接退出，确认标题/提示符已更新为 s09、`.memory/` 目录被自动创建，且立即退出、EOF 不挂起的行为不受影响
- 试试这些 prompt：
  - 记住：我叫小明，以后每次生成代码都不要写注释（应该看到模型写入记忆相关文件，`.memory/` 下出现新的 `.md` 文件，`.memory/MEMORY.md` 索引也更新了）
  - 另起一个新的 REPL 进程（重新执行 `node dist/index.js`），问"你还记得我是谁吗？我们之前聊过我的偏好"（不重新告诉它也应该能答对，验证记忆确实跨会话持久化了）
  - 执行 sudo apt update（应该仍被硬拒绝列表直接拦截）；请使用 task 工具派生一个子 Agent，执行 sudo apt update（应该看到子 Agent 内部同样被拦截，验证子 Agent 的权限钩子没有被这次改动移除）
