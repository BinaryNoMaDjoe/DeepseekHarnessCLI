# AGENTS.md — DeepSeek Harness CLI (DSHT) 仓库规范

本文件是仓库的最高工程规范，适用于所有 agent 与贡献者。CLAUDE.md 指向本文件。

## 项目是什么

DSHT 是 DeepSeek Harness (DSH) 的终端 CLI/TUI agent，对标 Claude Code / Kimi Code CLI。
它**不是**一个独立 agent 实现：它是一个挂在 DSH 之上的 **cordis bundle profile**
（`dsh --profile tui`），复用 DSH 的 agent-loop、工具、会话持久化、沙箱、审批等全部核心。

## 仓库地图

| 目录               | 包名                           | 职责                                                                                                                             |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sdk/`    | `@deepseek-harness/sdk`        | 框架无关的驱动层：事件模型、DshClient、审批 broker、REPL 状态机、headless 运行器、Fake 适配器。**零 DSH 依赖**                   |
| `packages/tui/`    | `@deepseek-harness/tui`        | React + Ink 全屏终端 UI：SessionStore、消息/工具卡片/diff 渲染、状态栏、输入框、审批弹窗。**只依赖 SDK**                         |
| `packages/bundle/` | `@deepseek-harness/tui-bundle` | cordis bundle：`cordis.patch.yml` + startup 命令行 + runner + DSH 适配器 + 审批桥 + mock LLM。**唯一允许接触 DSH 内部 API 的包** |
| `packages/cli/`    | `@deepseek-harness/cli`        | `dsht`/`dsht-install` 启动器与 profile 供给器                                                                                    |
| `docs/design/`     | —                              | 设计文档（架构、事件映射、功能规格）                                                                                             |
| `docs/audit/`      | —                              | DSH API 审计事实（全部结论附证据路径）                                                                                           |
| `scripts/`         | —                              | e2e-install.mjs / e2e-tui.mjs 开发工具                                                                                           |

## 铁律

1. **SDK 边界**：`tui` 和 `bundle` 的 UI 面只允许通过 `@deepseek-harness/sdk` 的公开接口
   消费核心；只有 `bundle` 可以 import `@deepseek-ai/*` 内部包（照 kimi-code 的
   `kimi-code-sdk` 边界规则）。新增 DSH 集成点必须先在 `docs/audit/` 里补审计证据。
2. **TUI 是 surface，不是第二套状态**：所有状态经 SDK 事件流进入 SessionStore；
   不在 React 组件里直接调用 DSH。
3. **事件形状与 DSH 对齐**：`docs/design/01-dsht-design.md` 的事件映射表是契约，
   改动 SDK 事件类型必须同步更新该表与翻译函数（`bundle/src/dsh-adapter.ts`）。
4. **测试即规格**：SDK/TUI 用 vitest + Fake 适配器单测；端到端用 mock LLM
   （`DSH_MOCK_LLM=1`）与 node-pty 脚本，见 scripts/。

## 常用命令

```bash
pnpm install          # 安装（首次运行后 pnpm approve-builds --all 放行 esbuild）
pnpm build            # 构建全部包（lib/）
pnpm typecheck        # 全仓类型检查
pnpm lint             # eslint
pnpm format          # prettier 写入
pnpm test             # 全部 vitest
pnpm coverage         # 覆盖率审计（门禁见 docs/testing.md §5）
node scripts/e2e-install.mjs   # 把 tui profile 装进 .tmp/dsh-home（link 本仓库 bundle）
node scripts/e2e-tui.mjs        # PTY 交互冒烟：/help → /theme 对话框 → mock 回复 → /exit
node scripts/e2e-approval.mjs   # 审批流：mock 触发 pwsh 提权 → 弹窗 → y 放行
node scripts/e2e-resume.mjs     # 跨进程恢复 + 会话列表
```

跑通 e2e 需要：`DSH_NPX_ROOT`（或默认路径）下的 node-pty 与 dsh 启动器。

## 代码规范

- **语言**：TypeScript strict（`noUncheckedIndexedAccess`），ESM only（`type: module`）。
- **相对导入必须带 `.js` 后缀**（NodeNext）。
- **文件命名**：普通模块 `kebab-case.ts`；React 组件 `PascalCase.tsx`；测试与被测文件同目录
  （`src/**/*.test.ts`，TUI 在 `test/`）。
- **禁止 `any`**（eslint error）。`!` 非空断言仅允许紧跟显式边界检查（`noUncheckedIndexedAccess`
  下的惯用模式），规则已放行。
- **注释默认不写**；只解释非显然的 why。事件/接口必须带 JSDoc（SDK 是契约）。
- **依赖**：运行时依赖最小化（sdk 零依赖、tui 仅 ink/react/chalk）；跨包依赖用相对 `link:`
  （dev 形态，发布前换成版本范围，见 CONTRIBUTING）。

## 提交与版本

- Conventional Commits：`feat(scope): subject` / `fix(scope): subject`；scope 用包名
  （sdk/tui/bundle/cli/docs）。
- 版本 `0.1.0` 起步；每次变更更新根 CHANGELOG.md 的 Unreleased 段。
- 提交前自审：`pnpm typecheck && pnpm lint && pnpm test` 全绿；涉及 TUI 交互的行为变化
  跑 `node scripts/e2e-tui.mjs`。
