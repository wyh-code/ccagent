// permission.ts - 三道权限门禁
//
// 工具执行前插入三道门禁：
//     门禁 1：硬拒绝列表（rm -rf /、sudo、...）
//     门禁 2：规则匹配（写入工作区外？破坏性命令？）
//     门禁 3：用户批准（暂停并等待确认）
//
//     +-------+    +--------+    +--------+    +--------+    +------+
//     | 工具  | -> | 门禁 1 | -> | 门禁 2 | -> | 门禁 3 | -> | 执行 |
//     | 调用  |    | 拒绝？ |    | 匹配？ |    | 允许？ |    |      |
//     +-------+    +--------+    +--------+    +--------+    +------+
//          |            |             |             |
//          v            v             v             v
//       （正常）      （拦截）      （询问用户）   （用户拒绝？）
import { isAbsolute, relative, resolve } from "node:path";
import { WORKDIR } from "./config.js";
import { red, yellow } from "./utils/colors.js";
import { getStdin } from "./utils/stdin.js";

// 门禁 1：硬拒绝列表，只针对 bash 命令，命中即直接拦截，不再询问用户
const DENY_LIST = ["rm -rf /", "sudo", "shutdown", "reboot", "mkfs", "dd if=", "> /dev/sda"];

function checkDenyList(command: string): string | null {
  for (const pattern of DENY_LIST) {
    if (command.includes(pattern)) {
      return `已拦截：'${pattern}' 在禁止列表中`;
    }
  }
  return null;
}

// 门禁 2：按工具名匹配的规则，命中后需要门禁 3 用户确认才能继续
interface PermissionRule {
  tools: string[];
  check: (args: Record<string, unknown>) => boolean;
  message: string;
}

function isOutsideWorkdir(p: string): boolean {
  const rel = relative(WORKDIR, resolve(WORKDIR, p));
  return rel.startsWith("..") || isAbsolute(rel);
}

const PERMISSION_RULES: PermissionRule[] = [
  {
    tools: ["write_file", "edit_file"],
    check: (args) => isOutsideWorkdir((args.path as string | undefined) ?? ""),
    message: "在工作区外写入",
  },
  {
    tools: ["bash"],
    check: (args) => {
      const command = (args.command as string | undefined) ?? "";
      return ["rm ", "> /etc/", "chmod 777"].some((keyword) => command.includes(keyword));
    },
    message: "可能破坏性的命令",
  },
];

function checkRules(toolName: string, args: Record<string, unknown>): string | null {
  for (const rule of PERMISSION_RULES) {
    if (rule.tools.includes(toolName) && rule.check(args)) {
      return rule.message;
    }
  }
  return null;
}

// 门禁 3：命中规则后暂停，等待用户在终端确认是否允许执行
async function askUser(
  toolName: string,
  args: Record<string, unknown>,
  reason: string
): Promise<"allow" | "deny"> {
  console.log(yellow(`\n⚠  ${reason}`));
  console.log(`   工具: ${toolName}(${JSON.stringify(args)})`);
  const choice = (await getStdin().question("   允许？[y/N] ")).trim().toLowerCase();
  return choice === "y" || choice === "yes" ? "allow" : "deny";
}

// 三道门禁串联：执行前依次检查各关卡，全部通过才允许执行
export async function checkPermission(
  toolName: string,
  args: Record<string, unknown>
): Promise<boolean> {
  if (toolName === "bash") {
    const reason = checkDenyList((args.command as string | undefined) ?? "");
    if (reason) {
      console.log(red(`\n⛔ ${reason}`));
      return false;
    }
  }
  const reason = checkRules(toolName, args);
  if (reason) {
    const decision = await askUser(toolName, args, reason);
    if (decision === "deny") {
      return false;
    }
  }
  return true;
}
