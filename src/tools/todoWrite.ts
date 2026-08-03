// todo_write 工具：维护当前编码会话的任务列表，仅用于规划，不执行任何实际操作
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { cyan, green, yellow } from "../utils/colors.js";

type TodoStatus = "pending" | "in_progress" | "completed";

interface TodoItem {
  content: string;
  status: TodoStatus;
}

// 当前任务列表，模块级状态，仅保存在内存中，不做持久化
let currentTodos: TodoItem[] = [];

const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: yellow("等待中"),
  in_progress: cyan("处理中"),
  completed: green("已完成"),
};

// 校验单个 todo 项的必填字段与状态取值，返回错误信息；校验通过返回 null
function validateTodo(todo: unknown, index: number): string | null {
  if (typeof todo !== "object" || todo === null) {
    return `错误：todos[${index}] 缺少 content 或 status`;
  }
  const item = todo as Record<string, unknown>;
  if (typeof item.content !== "string" || typeof item.status !== "string") {
    return `错误：todos[${index}] 缺少 content 或 status`;
  }
  if (!(item.status === "pending" || item.status === "in_progress" || item.status === "completed")) {
    return `错误：todos[${index}] 的状态无效：${item.status}`;
  }
  return null;
}

export async function runTodoWrite(args: Record<string, unknown>): Promise<string> {
  const todos = (args.todos as TodoItem[] | undefined) ?? [];

  for (let i = 0; i < todos.length; i++) {
    const error = validateTodo(todos[i], i);
    if (error !== null) {
      return error;
    }
  }

  currentTodos = todos;

  const lines = [yellow("\n## 当前任务")];
  for (const todo of currentTodos) {
    lines.push(`  [${STATUS_LABELS[todo.status]}] ${todo.content}`);
  }
  console.log(lines.join("\n"));

  return `已更新 ${currentTodos.length} 个任务`;
}

// todo_write 工具的 function-calling schema
export const todoWriteToolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "todo_write",
    description: "创建并管理当前编码会话的任务列表。",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
              },
            },
            required: ["content", "status"],
          },
        },
      },
      required: ["todos"],
    },
  },
};
