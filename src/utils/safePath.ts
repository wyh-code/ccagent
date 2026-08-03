// 路径安全校验：确保解析后的路径没有跑出工作区目录
import { isAbsolute, relative, resolve } from "node:path";
import { WORKDIR } from "../config.js";

export function safePath(p: string): string {
  const resolved = resolve(WORKDIR, p);
  const rel = relative(WORKDIR, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`路径超出工作区：${p}`);
  }
  return resolved;
}
