# ccagent

一个基于 TypeScript 实现的命令行编程 agent 工具：通过 OpenAI function-calling 驱动 `bash`/`read_file`/`write_file`/`edit_file`/`glob`/`todo_write`/`task`/`load_skill`/`compact` 九个工具，在交互式 REPL 中完成任务，其中 `task` 可以派生出上下文隔离的子 Agent，`load_skill` 支持按需加载技能说明文档，`compact` 用于在对话过长时主动压缩历史。此外还有一套跨会话持久化记忆机制（不是工具，是自动运行的背景逻辑）：把用户偏好、项目事实等知识沉淀成 Markdown 文件，下次启动也能记得；SYSTEM 提示词本身则是按运行时状态分段组装并做确定性缓存，而不是一整块写死的模板。

## 环境要求

- Node.js >= 18
- npm

## 安装依赖

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`，其中 `dist/index.js` 带有可执行文件的 shebang，可直接运行：

```bash
node dist/index.js
```

或者 `npm link` 后直接使用全局命令：

```bash
ccagent
```

## 使用方式

启动后进入交互式 REPL：输入问题回车发送，模型会按需调用工具在当前工作目录下完成任务并把结果回传，直到给出最终回答。输入 `q`、`exit` 或空行退出；`Ctrl+C`/`Ctrl+D` 同样会安全退出。

```
s10：System Prompt — 运行时组装与缓存
输入问题，回车发送。输入 q 退出。

s10 >> 列出当前目录下的文件
[HOOK] UserPromptSubmit：注入工作目录 /path/to/workdir
  [已组装] 片段: identity, workspace, tools, skills
> bash
[HOOK] bash(["ls -la"])
...
```

### SYSTEM 提示词组装与缓存

`src/systemPrompt.ts` 把 SYSTEM 提示词拆成几个按主题命名的片段（`identity`/`workspace`/`tools`/`skills`，以及条件性的 `memory`），每轮请求模型前按当前运行时状态选择性拼接，而不是维护一整块写死的模板字符串：

- `updateContext()` 从真实状态派生一份可判等比较的上下文：当前启用的工具名列表、工作目录、记忆索引内容（`readMemoryIndex()`）。
- `getSystemPrompt(context)` 把 `context` 排序序列化成一个缓存键，和上一次的键相同就直接复用上一次拼好的字符串（打印"[缓存命中] system prompt 未变化"）；不同才重新拼装（打印"[已组装] 片段: ..."，列出这次实际包含的片段名）。`identity`/`workspace`/`tools`/`skills` 始终包含，`memory` 只在记忆索引确实有内容时才加入。

因为 `enabledTools`/`workspace` 在一次进程运行期间不会变化，真正会让缓存失效、触发重新拼装的只有记忆索引内容变化（`extractMemories`/`consolidateMemories` 写入新记忆之后）——同一轮对话里的多次工具调用通常都会命中缓存，避免每次都重新拼一遍字符串；这个思路也对应到真实场景里，稳定的片段顺序有助于保住 API 一侧的 prompt 前缀缓存。

### 钩子系统

`agentLoop` 本身只负责"调用模型 → 执行工具 → 回写结果"这个主干流程，扩展逻辑都不写死在循环里，而是挂到 `hooks/` 目录下的四个事件上：

| 事件 | 时机 | 已注册的钩子 |
| --- | --- | --- |
| `UserPromptSubmit` | 用户输入送进模型之前 | `contextInjectHook`：把当前工作目录注入到 prompt 前面 |
| `PreToolUse` | 工具真正执行之前 | `permissionHook`：硬拒绝列表（如 `sudo`/`rm -rf /`）直接拦截；破坏性命令关键词（如 `rm `）/ 越界写入需要用户 y/N 确认；`logHook`：打印一行调用日志 |
| `PostToolUse` | 工具执行之后 | `largeOutputHook`：输出超过 10 万字符时打印告警 |
| `Stop` | 模型不再调用工具、本轮即将结束时 | `summaryHook`：打印本轮一共用了几次工具 |

`PreToolUse` 钩子按注册顺序依次执行，只要有一个返回非空的拦截原因就立即短路——`permissionHook` 排在 `logHook` 前面，所以被拦截的调用不会留下日志。`Stop` 钩子如果返回非空字符串，会被当成一条新的用户消息追加进历史，让 `agentLoop` 继续跑下去而不是真正退出。`compact` 工具的调用不经过 `PreToolUse`/`PostToolUse` 这两个钩子：`agentLoop` 在派发到 `TOOL_HANDLERS` 之前就会认出 `compact` 并直接触发整段历史压缩（见下文"上下文压缩"）。

### 任务规划（TodoWrite）

`todo_write` 工具让模型维护一份当前会话的任务清单（内存态，不落盘），每次调用都会整体覆盖任务列表并按状态打印图标（等待中留空/处理中青色 ▸/已完成绿色 ✓）。`agentLoop` 里有一个"距离上次更新任务列表已经过去几轮"的计数器：只要模型这一轮发起了工具调用，计数器就 +1；只要调用的是 `todo_write`，计数器清零。一旦计数达到 3 轮，下一轮开始前会往历史里插入一条 `<reminder>请更新你的 todo 列表。</reminder>` 的提醒消息，催促模型同步任务状态。

### 上下文压缩（Context Compact）

每次请求模型前，`agentLoop` 都会先跑一遍压缩管线（`src/compact.ts`），按"先便宜后昂贵"的顺序处理消息历史：

1. **L1 预算控制**（`toolResultBudget`）：所有工具结果总长度超过 200,000 字符时，优先把最大的几条落盘到 `.task_outputs/tool-results/`，历史里只留路径和前 2000 字符预览。
2. **L2 裁剪**（`snipCompact`）：消息条数超过 50 条时，只保留开头几条和结尾一段，中间替换成一条"[已裁剪 N 条消息]"提示。裁剪按"一次工具调用 + 它的响应"分组进行，保证不会把某条待响应的 `tool_calls` 消息和它的结果从中间切断。
3. **L3 占位替换**（`microCompact`）：超过 120 字符的较早工具结果（最近 3 条之外）替换成"[较早的工具结果已压缩]"占位符。
4. **L4 整段摘要**（`compactHistory`）：以上都不够、历史序列化后仍超过 50,000 字符时，把完整历史落盘为 `.transcripts/` 下的一份 JSONL 转录备份，再请求模型对全部历史生成一段摘要，用这一条摘要消息整体替换掉原有历史。

模型也可以主动调用 `compact` 工具触发一次 L4 摘要，用来主动释放上下文空间。如果请求模型时 API 直接报"上下文过长"类错误（`isContextTooLongError` 识别常见的几种错误关键词），会额外做一次应急压缩（`reactiveCompact`：摘要 + 保留最近几条原始消息，同样按分组取，不切断工具调用边界）并重试一次，仍然失败则把异常继续抛出。

#### 设计说明

`snipCompact`/`reactiveCompact` 按"工具调用 + 响应"分组后再裁剪/截取，而不是直接按下标做朴素切片：如果切点或截取范围落在某次工具调用（带 `tool_calls` 的 assistant 消息）和它的响应消息中间，会产生一条没有配对响应的 `tool_calls`，下一次请求会被 OpenAI 兼容接口以 `400`（`insufficient tool messages following tool_calls`）拒绝，导致进程崩溃退出。按分组处理保证任何裁剪/截取结果都不会破坏这个配对关系；代价是极端情况下（比如单次轮次里模型发起了几十个工具调用、一组本身就超过了预算）可能无法把消息数精确压到预算以内，但不会产生无效请求。

### 子 Agent（Subagent）

`task` 工具用一份全新的消息历史派生出一个独立的子 Agent，实现上下文隔离：子 Agent 内部完整的工具调用过程（多轮模型请求、每一步的工具执行结果）都不会进入父级的对话历史，父级只拿到子 Agent 最后给出的一段摘要文本作为这次 `task` 调用的结果。子 Agent：

- 只能使用基础五个工具（`bash`/`read_file`/`write_file`/`edit_file`/`glob`，定义在 `tools/baseTools.ts`），不含 `todo_write`/`task`/`load_skill`/`compact`，避免无限递归派生子 Agent、且不跑压缩管线
- 使用独立的系统提示词 `SUB_SYSTEM`（要求"完成任务后给摘要，不要继续委派"）
- 最多运行 30 轮，超过上限或没有明确结论时会退回一句兜底提示
- 内部的工具调用仍然会触发全局 `PreToolUse`/`PostToolUse` 钩子（权限校验、日志等），只是不会触发 `UserPromptSubmit`

### 技能加载（Skill Loading）

启动时会扫描工作目录下的 `skills/` 子目录（`src/skills.ts`），把每个含 `SKILL.md` 的子目录注册成一个"技能"：优先取文件开头 YAML frontmatter 里的 `name`/`description` 字段，缺失时分别退回目录名和正文首行。这份"技能名 + 一行描述"的目录会被拼进 `SYSTEM` 提示词，模型每次对话都能看到、但只占很小的 token 开销；真正的完整内容只有模型主动调用 `load_skill(name)` 时才会通过工具结果注入进对话，实现"目录常驻、内容按需"的两级加载。`skills/` 目录不存在或没有任何技能时，目录会显示"（未找到技能）"，不影响其余功能正常使用。

项目自带两个示例技能（`skills/code-review-checklist/`、`skills/history-entry/`），分别是提交前检查清单和 `HISTORY.md` 写法说明，可以直接体验 `load_skill` 的效果；新增技能只需在 `skills/` 下建一个子目录，放一个带 `---` frontmatter 的 `SKILL.md` 即可：

```markdown
---
name: my-skill
description: 一句话描述这个技能是做什么的
---

# 正文标题

技能的完整说明内容，只有被 load_skill 加载时才会进入对话。
```

### 跨会话记忆（Memory）

`src/memory.ts` 实现一套背景运行的持久化记忆机制，把值得长期记住的用户偏好、约束、项目事实沉淀成工作目录下 `.memory/` 里的 Markdown 文件，跨进程、跨会话都能读到：

```
.memory/
  MEMORY.md          ← 索引：每条记忆一行「[名称](文件名) — 一行描述」
  xiaoming.md         ← 单条记忆：YAML frontmatter（name/description/type）+ 正文
  no-code-comments.md
```

- **索引常驻，正文按需**：`MEMORY.md` 索引内容会作为 `memory` 片段拼进每一轮的 SYSTEM 提示词（只占很小的 token 开销，见上文"SYSTEM 提示词组装与缓存"）；索引内容变化时才会触发重新拼装，其余情况下直接复用缓存结果。
- **按相关性注入正文**：每轮请求模型前，`loadMemories()` 会看最近几条用户消息，用一次轻量 LLM 调用从记忆目录里挑出明显相关的几条（挑选失败时退回关键词匹配），把选中记忆的完整正文包在 `<relevant_memories>` 标签里追加到这一轮的 SYSTEM 末尾。
- **自动提取**：`agentLoop` 每轮真正结束（模型给出最终回答、不再调用工具）时，都会用一次 LLM 调用尝试从最近的对话内容里提取新记忆（用户说"记住"或表达出明确偏好时最容易触发），提取到就写文件、重建索引；如果没有新内容或已经被现有记忆覆盖，模型会返回空数组，什么也不写。模型自己也可以直接用 `write_file` 写 `.memory/` 下的文件，不受这条自动提取路径限制。
- **定期整理**：记忆文件数达到 10 条时，`consolidateMemories()` 会把所有记忆内容打包丢给模型，让它合并重复项、删掉过时或矛盾的记忆，总数控制在 30 条以内，再整体重写。

`.memory/` 会在进程启动时自动创建，已加入 `.gitignore`——记忆内容是运行时基于真实对话生成的用户数据，不是随代码库分发的示例内容。

### 可用工具

| 工具 | 说明 |
| --- | --- |
| `bash` | 执行一条 shell 命令 |
| `read_file` | 读取文件内容，可选 `limit` 限制返回行数 |
| `write_file` | 写入文件内容（自动创建父目录） |
| `edit_file` | 在文件中精确替换一段文本（仅替换一次） |
| `glob` | 按 glob 模式在工作区目录下查找文件 |
| `todo_write` | 创建并管理当前会话的任务列表 |
| `task` | 派生一个子 Agent 处理复杂子任务，仅返回最终结论 |
| `load_skill` | 按名称加载某个技能的完整 `SKILL.md` 内容 |
| `compact` | 摘要较早对话以释放上下文空间（没有独立 handler，由 `agentLoop` 特殊拦截处理） |

`read_file`/`write_file`/`edit_file`/`glob` 都会先做路径校验（`utils/safePath.ts`），拒绝任何解析后跑出工作区目录的路径。

## 其他脚本

| 命令 | 说明 |
| --- | --- |
| `npm run typecheck` | 仅做类型检查，不产生构建产物 |
| `npm run lint` | 运行 ESLint 检查 `src` 目录 |
| `npm run format` | 使用 Prettier 格式化 `src` 目录 |
| `npm test` | 运行 Vitest 测试 |

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

- `OPENAI_API_KEY`：OpenAI（或兼容接口）的 API key，必填
- `OPENAI_BASE_URL`：可选，自定义 API 基地址
- `MODEL_ID`：使用的模型 ID，必填

`OPENAI_API_KEY`、`MODEL_ID` 缺失时，进程启动阶段会直接抛错退出。

## 运行期生成的目录

`.transcripts/`（压缩前的完整历史备份）、`.task_outputs/tool-results/`（超大工具结果落盘）、`.memory/`（跨会话记忆文件）都是运行时按需生成的，已加入 `.gitignore`，不需要手动创建或清理。

## 项目结构

```
ccagent/
├── src/
│   ├── index.ts        # CLI 入口：commander 注册命令并启动 REPL
│   ├── repl.ts          # 交互式 REPL 循环
│   ├── agent.ts         # agentLoop：核心 Agent 循环
│   ├── config.ts        # 环境变量加载、OpenAI 客户端、常量
│   ├── systemPrompt.ts  # updateContext()/getSystemPrompt()：按运行时上下文分段组装并缓存 SYSTEM
│   ├── skills.ts        # 技能注册表：扫描 skills/ 目录、解析 frontmatter
│   ├── compact.ts       # 四层上下文压缩管线 + 应急压缩
│   ├── memory.ts        # 跨会话记忆：读写 .memory/ 下的记忆文件、按相关性注入、自动提取/整理
│   ├── hooks/
│   │   ├── index.ts             # 钩子注册表 + 四个 trigger 函数
│   │   ├── contextInjectHook.ts # UserPromptSubmit：注入工作目录
│   │   ├── permissionHook.ts    # PreToolUse：硬拒绝列表 + 破坏性操作确认
│   │   ├── logHook.ts           # PreToolUse：调用日志
│   │   ├── largeOutputHook.ts   # PostToolUse：大输出告警
│   │   └── summaryHook.ts       # Stop：工具调用次数摘要
│   ├── utils/
│   │   ├── colors.ts    # 终端高亮小工具
│   │   ├── safePath.ts  # 路径安全校验，拒绝跑出工作区的路径
│   │   ├── stdin.ts     # 全进程共享的 readline 接口
│   │   ├── history.ts   # 把 SDK 消息对象转换成可放进历史的普通对象
│   │   ├── frontmatter.ts  # 解析 Markdown 文件的 YAML frontmatter（技能/记忆文件共用）
│   │   └── messageText.ts  # 从消息 content 字段提取纯文本（子 Agent/记忆提取共用）
│   └── tools/
│       ├── bash.ts       # bash 工具：超时、输出截断
│       ├── readFile.ts   # read_file 工具
│       ├── writeFile.ts  # write_file 工具
│       ├── editFile.ts   # edit_file 工具
│       ├── glob.ts       # glob 工具
│       ├── todoWrite.ts  # todo_write 工具：维护会话任务列表
│       ├── task.ts       # task 工具：派生子 Agent，独立消息历史
│       ├── loadSkill.ts  # load_skill 工具：按名称加载完整技能内容
│       ├── compact.ts    # compact 工具 schema（无 handler，agentLoop 里特殊处理）
│       ├── baseTools.ts  # 子 Agent 可用的基础工具集合（不含 todo_write/task）
│       ├── types.ts      # 工具处理函数的公共类型
│       └── index.ts      # 工具注册表（TOOLS + TOOL_HANDLERS）
├── skills/                        # 技能目录，每个子目录一个 SKILL.md
│   ├── code-review-checklist/     # 提交前检查清单
│   └── history-entry/             # HISTORY.md 写法说明
├── dist/           # 构建产物（不入库）
├── tsconfig.json   # TypeScript 编译配置
├── tsup.config.ts  # 构建打包配置
└── eslint.config.js
```
