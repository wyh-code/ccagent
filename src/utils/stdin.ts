// 全进程共享的一个 readline 接口：主 REPL 循环和权限确认提示都用它，
// 避免在同一个 stdin 上同时存在多个 readline 接口互相抢输入
import { createInterface, type Interface } from "node:readline/promises";

let sharedInterface: Interface | undefined;

export function getStdin(): Interface {
  if (!sharedInterface) {
    sharedInterface = createInterface({ input: process.stdin, output: process.stdout });
  }
  return sharedInterface;
}

export function closeStdin(): void {
  sharedInterface?.close();
  sharedInterface = undefined;
}
