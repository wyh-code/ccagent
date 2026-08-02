import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  dts: true,
  sourcemap: true,
  clean: true,
  // 构建产物首行插入 shebang，使 dist/index.js 可以直接作为可执行文件运行
  banner: {
    js: "#!/usr/bin/env node",
  },
});
