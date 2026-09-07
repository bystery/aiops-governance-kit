# 宿主兼容边界

这份表只记录已实现的核心行为和当前验证状态。配置文件存在不等于宿主已经加载。

| 宿主 | 当前状态 | 说明 |
|---|---|---|
| Generic/manual | 已实现 | 可在任意能运行 Node.js 的项目中手动调用 init、status、checkpoint、handoff、resume、verify、check |
| ZCode | 契约已提供，真实接入未验证 | `guanjia/adapters/zcode/hooks.json` 描述事件；用 `probe`/`host-event` 记录真实 nonce 回执；项目文件不等于用户级插件注册 |
| Codex | 契约已提供，真实接入未验证 | `guanjia/adapters/codex/hooks.json` 描述事件；需要宿主信任/启用后的真实 SessionStart、用户输入和压缩恢复回执 |
| Qoder IDE | 契约已提供，真实接入未验证 | `guanjia/adapters/qoder/hooks.json` 只描述候选事件；IDE 事件和 CLI 不应混用，需要按实际发行版做探针 |
| WorkBuddy | 契约已提供，真实接入未验证 | `guanjia/adapters/workbuddy/hooks.json` 只描述候选事件；需要确认具体桌面版/企业版和配置作用域 |

项目内同时提供 `guanjia.ps1`、`guanjia.cmd` 和 `guanjia.sh` 薄包装器。包装器只负责定位项目根目录和转发参数，不代表对应宿主已经加载适配器。

## `doctor` 的解释

- `pass`：本地核心能直接证明的事实，例如状态可解析、资源清单一致。
- `warn`：能力缺失但手动流程仍可用，例如没有 Git 或提交检查未配置。
- `unverified`：需要真实宿主事件才能证明，不能当成自动恢复已生效。
- `fail`：应先修复，例如 manifest 缺文件、入口区块不完整或状态损坏。

本文件不把 shell hook、插件 manifest 或静态配置写成“已接入”的证据。真实探针需要记录宿主版本、配置来源、唯一 nonce、预期事件、实际回执和限制。
