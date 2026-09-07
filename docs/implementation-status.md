# 管家实施状态

基线：`bystery/aiops-governance-kit` `main`，原审查提交 `01597e0c78389815ed2e5c14922983d4aa6ad32a`。

## 本次已落地

- M1 核心部分：Node 标准库安装器、写入前预检、可见 `guanjia/` 资料夹、原子写入、受管 `AGENTS.md` 区块、资源 manifest、doctor 和旧 `.aiops/` 保留提示。
- M2 核心部分：`state.json`、revision 乐观并发检查、本地锁、checkpoint、handoff、resume、状态面板和固定交接模板。
- M4 基础部分：任务范围/完成标准/复用字段、风险级别与验证模式、结构化验证证据、任务契约摘要、argv 执行、超时/命令缺失的 NOT_RUN、低风险文档轻量快照验证、快照绑定、暂存区检查。
- M0 回归：已有规则不覆盖、特殊字符项目名、重复安装、用户暂停、坏状态/缺资源等核心 fixture。
- M3/M4 增量：ZCode/Codex 适配契约、可审查的 ZCode marketplace/Codex hooks 模板、Node 薄桥接脚本、精简宿主事件与会话 ID 记录、带 nonce/host/event 契约校验的宿主探针、真实回执记录、组合式 pre-commit 安装和 doctor 生效判断。
- M5 增量：`.aiops` 迁移 dry-run、显式 apply、冲突识别、源目录保留和卸载前清单。
- M6 增量：安装器复制单一 Node 核心、PowerShell/CMD/POSIX 薄包装器、generic/Qoder/WorkBuddy 适配契约，以及从项目外工作目录调用的回归测试。

## 尚未落地或尚未实测

- ZCode/Codex 插件启用、信任和跨客户端自动注入仍未完成真实实测；当前已提供可审查的适配包和桥接脚本，尚未取得真实客户端回执。
- 完整的 `.aiops` 语义迁移/卸载事务；当前版本只安全复制历史、登记索引并提供卸载 dry-run。提交 hook 已支持受保护的 `hooks uninstall` 回退，但不会自动删除状态、证据或覆盖用户修改。
- Windows PowerShell/CMD 原生和 macOS Finder ZIP 解压实机验证仍待用户环境确认；仓库已提供对应入口与 Linux shell smoke test。
- Husky 等动态 hook 管理器的长期稳定性；`hooks install` 会保留已有检查并组合运行，但不会静默修改已有 `core.hooksPath` 配置。

## 回退入口

删除本次生成的 `guanjia/` 受管资料和 `AGENTS.md` 中的 `GUANJIA BEGIN/END` 区块即可停止新核心；旧 `.aiops/` 和受管区块外的原文不会由安装器删除。若 `guanjia/runtime/backups/` 存在，先人工比较再恢复，不能盲目覆盖用户后续修改。
