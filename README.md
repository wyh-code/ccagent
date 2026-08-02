# ccagent

一个基于 TypeScript 实现的命令行编程 agent 工具：通过 OpenAI function-calling 驱动一个 `bash` 工具，在交互式 REPL 中完成任务。

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

启动后进入交互式 REPL：输入问题回车发送，模型会按需调用 `bash` 工具在当前工作目录下执行命令并把结果回传，直到给出最终回答。输入 `q`、`exit` 或空行退出；`Ctrl+C`/`Ctrl+D` 同样会安全退出。

```
s01：Agent 循环
输入问题，回车发送。输入 q 退出。

s01 >> 列出当前目录下的文件
$ ls
...
```

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
│   ├── utils/
│   │   └── colors.ts    # 终端高亮小工具
│   └── tools/
│       ├── bash.ts      # bash 工具：危险命令拦截、超时、输出截断
│       └── index.ts     # 工具注册表（TOOLS + TOOL_HANDLERS）
├── dist/           # 构建产物（不入库）
├── tsconfig.json   # TypeScript 编译配置
├── tsup.config.ts  # 构建打包配置
└── eslint.config.js
```
