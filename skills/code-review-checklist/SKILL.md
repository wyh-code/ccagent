---
name: code-review-checklist
description: 提交代码前要跑的检查清单（typecheck/lint/build + 手动冒烟）
---

# 提交前检查清单

在 ccagent 项目里认为一次改动"完成"之前，按顺序过一遍：

1. **类型检查**：`npm run typecheck`，不允许有任何报错。
2. **Lint**：`npm run lint`，不允许有任何报错。
3. **构建**：`npm run build`，确认 `tsup` 能正常打包出 `dist/`，且构建过程本身没有报错或警告。
4. **测试**：`npm test`，如果项目里有测试用例必须全部通过；没有测试用例时确认命令本身能正常跑完退出。
5. **冷启动冒烟**：`printf "q\n" | node dist/index.js`，确认不依赖真实 API Key 也能正常打印欢迎语并在输入 `q` 后立刻退出（退出码 0）；再用 `node dist/index.js < /dev/null` 模拟 Ctrl+D 关闭输入流，确认 EOF 场景不会挂起。
6. **模块依赖方向检查**（只在新增/调整了模块间依赖关系时需要）：如果这次改动让某个模块反过来被它原本依赖的模块引用，确认没有引入循环导入——ESM 下循环导入可能导致某个导出在被使用时仍是未初始化状态，报错通常是运行时才出现，`tsc`/`eslint` 未必能提前发现，需要实际跑一遍 `node dist/index.js` 验证。
7. **README/HISTORY 同步**：确认 `README.md`（工具表、项目结构、相关章节）和 `HISTORY.md`（新增一条记录，附验证步骤或自然语言测试 prompt）都已经跟着这次改动更新。

只有以上都过了才可以认为这次改动符合工程化要求，不要跳过任何一步。
