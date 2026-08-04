# ccagent

一个基于 TypeScript 实现的命令行编程 agent 工具：通过 OpenAI function-calling 驱动 `bash`/`read_file`/`write_file`/`edit_file`/`glob`/`todo_write`/`task`/`load_skill`/`compact` 九个工具，在交互式 REPL 中完成任务，其中 `task` 可以派生出上下文隔离的子 Agent，`load_skill` 支持按需加载技能说明文档，`compact` 用于在对话过长时主动压缩历史。

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
s08：Context Compact — 四层压缩管线
输入问题，回车发送。输入 q 退出。

s08 >> 列出当前目录下的文件
[HOOK] UserPromptSubmit：注入工作目录 /path/to/workdir
> bash
[HOOK] bash(["ls -la"])
...
```

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
2. **L2 裁剪**（`snipCompact`）：消息条数超过 50 条时，只保留开头几条和结尾一段，中间替换成一条"[已裁剪 N 条消息]"提示。裁剪按"一次工具调用 + 它的响应"分组进行，保证不会把某条待响应的 `tool_calls` 消息和它的结果从中间切断——这一点和参考实现的朴素按下标切片不同，是移植时额外加固的（后面"已知取舍"一节详细说明原因）。
3. **L3 占位替换**（`microCompact`）：超过 120 字符的较早工具结果（最近 3 条之外）替换成"[较早的工具结果已压缩]"占位符。
4. **L4 整段摘要**（`compactHistory`）：以上都不够、历史序列化后仍超过 50,000 字符时，把完整历史落盘为 `.transcripts/` 下的一份 JSONL 转录备份，再请求模型对全部历史生成一段摘要，用这一条摘要消息整体替换掉原有历史。

模型也可以主动调用 `compact` 工具触发一次 L4 摘要，用来主动释放上下文空间。如果请求模型时 API 直接报"上下文过长"类错误（`isContextTooLongError` 识别常见的几种错误关键词），会额外做一次应急压缩（`reactiveCompact`：摘要 + 保留最近几条原始消息，同样按分组取，不切断工具调用边界）并重试一次，仍然失败则把异常继续抛出。

#### 已知取舍

- **只保留了"新增压缩机制"，没有跟进删掉已有的安全/摘要功能**：这一阶段的教学示例代码同时把 `permissionHook` 的破坏性命令确认、越界写入确认，以及 `Stop`/`summaryHook`、`todo_write` 催促提醒都简化掉了，只字未提这是本节要移除的内容——看起来只是教学示例为了突出"压缩"这一个新知识点做的减法。ccagent 是持续维护的项目，不会仅仅因为教学脚本在讲下一课时顺手做了简化，就跟着回退已经验证过的安全和摘要功能，所以这几处一仍其旧。
- **`snipCompact`/`reactiveCompact` 做了分组感知加固**：按原始参考实现的朴素下标切片，在消息数刚好超过阈值、且切点落在某次工具调用和它的响应中间时，会产生一条没有对应工具结果的 `tool_calls`，下一次请求直接被 OpenAI 兼容接口拒绝（`400 ... insufficient tool messages following tool_calls`）——这在实测里用一个连续发起十几次工具调用的会话就能稳定复现，不是极端边界情况。按"工具调用 + 响应"分组后再裁剪/截取，避免了这个问题；代价是极端情况下（比如单次轮次里模型发起了几十个工具调用，一组就超过了预算）可能无法把消息数精确压到预算以内，但比直接崩溃更安全。

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

`.transcripts/`（压缩前的完整历史备份）和 `.task_outputs/tool-results/`（超大工具结果落盘）都是运行时按需生成的，已加入 `.gitignore`，不需要手动创建或清理。

## 项目结构

```
ccagent/
├── src/
│   ├── index.ts        # CLI 入口：commander 注册命令并启动 REPL
│   ├── repl.ts          # 交互式 REPL 循环
│   ├── agent.ts         # agentLoop：核心 Agent 循环
│   ├── config.ts        # 环境变量加载、OpenAI 客户端、常量
│   ├── systemPrompt.ts  # 拼装主 Agent 的 SYSTEM 提示词（含技能目录）
│   ├── skills.ts        # 技能注册表：扫描 skills/ 目录、解析 frontmatter
│   ├── compact.ts       # 四层上下文压缩管线 + 应急压缩
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
│   │   └── history.ts   # 把 SDK 消息对象转换成可放进历史的普通对象
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
