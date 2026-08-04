// 工具处理函数的统一类型：接收模型传入的参数对象，返回回传给模型的字符串结果
export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;
