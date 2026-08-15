# 贡献指南

## 开发工作流

1. 读 `AGENTS.md`（规范）与 `docs/design/01-dsht-design.md`（契约）。
2. 非平凡改动先在 `docs/design/` 写设计片段或更新对应章节，再动代码。
3. 涉及 DSH 集成点：先在 `docs/audit/dsh-api-audit.md` 补审计事实
   （【包/文件:行号】级别），再实现。
4. 实现 + 单测；SDK/TUI 用 Fake 适配器，不 mock DSH。
5. 全绿：`pnpm typecheck && pnpm lint && pnpm test`。
6. 端到端验证：`node scripts/e2e-install.mjs` + `node scripts/e2e-tui.mjs`
   （mock LLM，无需 API key）。

## 发布注意

- 当前跨包依赖为相对 `link:`（dev 形态，profile 外部可解析）。
  发布 npm 前：把 `link:../sdk` 等换成 `^0.1.0` 版本范围，
  `bundle` 的 `files` 里确认包含 `cordis.patch.yml`。
- `dsht install` 默认从 registry 安装 bundle；开发用 `--link <checkout>`。

## 测试矩阵

| 层                                | 工具                | 位置                    |
| --------------------------------- | ------------------- | ----------------------- |
| SDK 逻辑                          | vitest              | `packages/sdk/test/`    |
| TUI 纯逻辑（store/markdown/diff） | vitest              | `packages/tui/test/`    |
| 事件翻译                          | vitest              | `packages/bundle/test/` |
| CLI manifest                      | vitest              | `packages/cli/test/`    |
| 全链路                            | mock LLM + node-pty | `scripts/e2e-tui.mjs`   |
