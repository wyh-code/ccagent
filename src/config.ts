// 全局运行配置：加载环境变量、创建 OpenAI 客户端、导出 Agent 用到的常量
import { config as loadEnv } from "dotenv";
import OpenAI from "openai";

// 加载 .env 文件中的环境变量，override 为 true 表示覆盖已存在的同名变量
loadEnv({ override: true });

// 读取一个必需的环境变量，缺失时直接抛错（对应未捕获异常导致进程退出）
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必需的环境变量：${name}`);
  }
  return value;
}

// 工作区目录：进程启动时的当前目录，所有相对路径都基于它解析
export const WORKDIR = process.cwd();

// 统一使用 UTF-8，读写文件和执行命令时都用它
export const TEXT_ENCODING = "utf-8";

// OpenAI 客户端实例，baseURL 为空时使用 SDK 默认地址
export const openai = new OpenAI({
  apiKey: requireEnv("OPENAI_API_KEY"),
  baseURL: process.env.OPENAI_BASE_URL,
});

// 对话使用的模型 ID
export const MODEL = requireEnv("MODEL_ID");

// 系统提示词，告知模型自己所处的工作目录，并要求先规划再执行、复杂子问题派生子 Agent
export const SYSTEM =
  `你是一个位于 ${WORKDIR} 的编程 Agent。` +
  "遇到复杂子问题时，使用 task 工具派生子 Agent。" +
  "开始多步骤任务前，先用 todo_write 规划步骤。" +
  "直接行动，不要解释。";

// 子 Agent 独立的系统提示词：只负责完成分配到的任务并给出摘要，不能继续派生子 Agent
export const SUB_SYSTEM =
  `你是一个位于 ${WORKDIR} 的编程 Agent。` +
  "完成分配给你的任务，然后返回简洁摘要。" +
  "不要继续委派。";
