# ccagent

一个基于 TypeScript 实现的命令行编程 agent 工具：通过 OpenAI function-calling 驱动 `bash`/`read_file`/`write_file`/`edit_file`/`glob`/`todo_write` 六个工具，在交互式 REPL 中完成任务。

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
s05：TodoWrite — 先规划再执行，忘了就催
输入问题，回车发送。输入 q 退出。

s05 >> 列出当前目录下的文件
[HOOK] UserPromptSubmit：注入工作目录 /path/to/workdir
[HOOK] bash(["ls -la"])
...
```

### 钩子系统

`agentLoop` 本身只负责"调用模型 → 执行工具 → 回写结果"这个主干流程，扩展逻辑都不写死在循环里，而是挂到 `hooks/` 目录下的四个事件上：

| 事件 | 时机 | 已注册的钩子 |
| --- | --- | --- |
| `UserPromptSubmit` | 用户输入送进模型之前 | `contextInjectHook`：把当前工作目录注入到 prompt 前面 |
| `PreToolUse` | 工具真正执行之前 | `permissionHook`：硬拒绝列表 + 破坏性命令/越界写入需要用户 y/N 确认；`logHook`：打印一行调用日志 |
| `PostToolUse` | 工具执行之后 | `largeOutputHook`：输出超过 10 万字符时打印告警 |
| `Stop` | 模型不再调用工具、本轮即将结束时 | `summaryHook`：打印本轮一共用了几次工具 |

`PreToolUse` 钩子按注册顺序依次执行，只要有一个返回非空的拦截原因就立即短路——`permissionHook` 排在 `logHook` 前面，所以被拦截的调用不会留下日志。`Stop` 钩子如果返回非空字符串，会被当成一条新的用户消息追加进历史，让 `agentLoop` 继续跑下去而不是真正退出（当前注册的 `summaryHook` 只打印摘要、不会触发这个机制，但预留了这个扩展点）。

### 任务规划（TodoWrite）

`todo_write` 工具让模型维护一份当前会话的任务清单（内存态，不落盘），每次调用都会整体覆盖任务列表并按状态着色打印（等待中/处理中/已完成）。`agentLoop` 里有一个"距离上次更新任务列表已经过去几轮"的计数器：只要模型这一轮发起了工具调用，计数器就 +1；只要调用的是 `todo_write`，计数器清零。一旦计数达到 3 轮，下一轮开始前会往历史里插入一条 `<reminder>请更新你的 todo 列表。</reminder>` 的提醒消息，催促模型同步任务状态。

### 可用工具

| 工具 | 说明 |
| --- | --- |
| `bash` | 执行一条 shell 命令 |
| `read_file` | 读取文件内容，可选 `limit` 限制返回行数 |
| `write_file` | 写入文件内容（自动创建父目录） |
| `edit_file` | 在文件中精确替换一段文本（仅替换一次） |
| `glob` | 按 glob 模式在工作区目录下查找文件 |
| `todo_write` | 创建并管理当前会话的任务列表 |

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

## 项目结构

```
ccagent/
├── src/
│   ├── index.ts        # CLI 入口：commander 注册命令并启动 REPL
│   ├── repl.ts          # 交互式 REPL 循环
│   ├── agent.ts         # agentLoop：核心 Agent 循环
│   ├── config.ts        # 环境变量加载、OpenAI 客户端、常量
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
│   │   └── stdin.ts     # 全进程共享的 readline 接口
│   └── tools/
│       ├── bash.ts       # bash 工具：超时、输出截断
│       ├── readFile.ts   # read_file 工具
│       ├── writeFile.ts  # write_file 工具
│       ├── editFile.ts   # edit_file 工具
│       ├── glob.ts       # glob 工具
│       ├── todoWrite.ts  # todo_write 工具：维护会话任务列表
│       └── index.ts      # 工具注册表（TOOLS + TOOL_HANDLERS）
├── dist/           # 构建产物（不入库）
├── tsconfig.json   # TypeScript 编译配置
├── tsup.config.ts  # 构建打包配置
└── eslint.config.js
```
