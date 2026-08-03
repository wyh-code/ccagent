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

// OpenAI 客户端实例，baseURL 为空时使用 SDK 默认地址
export const openai = new OpenAI({
  apiKey: requireEnv("OPENAI_API_KEY"),
  baseURL: process.env.OPENAI_BASE_URL,
});

// 对话使用的模型 ID
export const MODEL = requireEnv("MODEL_ID");

// 系统提示词，告知模型自己所处的工作目录
export const SYSTEM = `你是一个位于 ${WORKDIR} 的编程 Agent。所有破坏性操作需要用户批准。`;
