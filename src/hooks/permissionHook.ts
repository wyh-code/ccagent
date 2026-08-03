// hooks/permissionHook.ts - PreToolUse 钩子：拦截危险命令和越界写入
import { isOutsideWorkdir } from "../utils/safePath.js";
import { red, yellow } from "../utils/colors.js";
import { getStdin } from "../utils/stdin.js";

// 硬拒绝关键字：命中直接拦截，不询问用户
const DENY_LIST = ["rm -rf /", "sudo", "shutdown", "reboot", "mkfs", "dd if="];

// 有一定容错空间的破坏性命令关键字：命中后询问用户是否放行
const DESTRUCTIVE = ["rm ", "> /etc/", "chmod 777"];

async function confirm(name: string, args: Record<string, unknown>): Promise<boolean> {
  console.log(`   工具: ${name}(${JSON.stringify(args)})`);
  const choice = (await getStdin().question("   允许？[y/N] ")).trim().toLowerCase();
  return choice === "y" || choice === "yes";
}

// 返回 null 表示放行，返回字符串表示拦截原因（会作为工具结果回传给模型）
export async function permissionHook(
  name: string,
  args: Record<string, unknown>
): Promise<string | null> {
  if (name === "bash") {
    const command = (args.command as string | undefined) ?? "";
    for (const pattern of DENY_LIST) {
      if (command.includes(pattern)) {
        console.log(red(`\n⛔ 已拦截：'${pattern}'`));
        return "禁止列表拒绝权限";
      }
    }
    for (const keyword of DESTRUCTIVE) {
      if (command.includes(keyword)) {
        console.log(yellow("\n⚠  可能破坏性的命令"));
        if (!(await confirm(name, args))) {
          return "用户拒绝权限";
        }
      }
    }
  }

  if (name === "write_file" || name === "edit_file") {
    const path = (args.path as string | undefined) ?? "";
    if (isOutsideWorkdir(path)) {
      console.log(yellow("\n⚠  在工作区外写入"));
      if (!(await confirm(name, args))) {
        return "用户拒绝权限";
      }
    }
  }

  return null;
}
