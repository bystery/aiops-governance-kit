# 宿主适配契约

适配器只负责把宿主事件翻译成管家核心调用，不复制状态机、任务规则或验证逻辑。当前契约覆盖 generic/manual、ZCode、Codex、Qoder 和 WorkBuddy；其中后四者除非收到真实探针回执，否则仍按 `unverified` 处理。

适配器能力分为三种：`supported`（已在真实宿主触发并有 nonce 回执）、`unverified`（配置或模拟存在，但未真实触发）、`unsupported`（该宿主明确没有此事件）。配置文件存在不等于已加载。

当前仓库还提供两份可审查的薄适配包：

- ZCode：`adapters/zcode-marketplace/` 是本地 marketplace，内含 `.zcode-plugin/plugin.json`、`hooks/hooks.json` 和 Node hook。把该目录作为本地 marketplace 添加、安装并启用后，必须新建会话验证；项目级 `.zcode/config.json` 不会被当成已接入。
- Codex：`adapters/codex/project-hooks.json` 是项目级 `.codex/hooks.json` 模板，`adapters/codex/hook.mjs` 只读取 stdin、定位当前项目并调用核心 `context`。请人工合并到 `.codex/hooks.json`，再通过 Codex 的 hook 信任流程；未信任时保持降级。

两个适配器只注入短恢复上下文，并把事件类型、宿主和会话 ID 作为精简诊断记录写入 `guanjia/records/events/`；不保存原始 prompt，不自动替用户写任务、扩大范围或把 Stop 事件变成无限续跑。适配包与项目核心隔离，真实宿主触发仍须用 `probe`/`host-event` 另行记录回执。

真实探针流程：

```sh
node guanjia/bin/guanjia.mjs probe --host zcode --nonce zcode-demo-001
node guanjia/bin/guanjia.mjs host-event --input '{"nonce":"zcode-demo-001","event":"session_start","session_id":"真实宿主提供的 id","host":"zcode"}'
node guanjia/bin/guanjia.mjs doctor --json
```

探针只记录回执，不自动执行用户任务；未收到同 nonce 的真实事件前，doctor 必须显示 `unverified`。
