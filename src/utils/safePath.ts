// 路径安全校验：确保解析后的路径没有跑出工作区目录
import { isAbsolute, relative, resolve } from "node:path";
import { WORKDIR } from "../config.js";

// 只做判断，不抛错，供需要自行处理"越界"情况的调用方使用（比如权限钩子、glob 过滤）
export function isOutsideWorkdir(p: string): boolean {
  const rel = relative(WORKDIR, resolve(WORKDIR, p));
  return rel.startsWith("..") || isAbsolute(rel);
}

export function safePath(p: string): string {
  if (isOutsideWorkdir(p)) {
    throw new Error(`路径超出工作区：${p}`);
  }
  return resolve(WORKDIR, p);
}
