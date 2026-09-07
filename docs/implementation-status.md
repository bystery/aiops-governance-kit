# 管家实施状态

基线：`bystery/aiops-governance-kit` `main`，原审查提交 `01597e0c78389815ed2e5c14922983d4aa6ad32a`。

## 本次已落地

- M1 核心部分：Node 标准库安装器、可见 `guanjia/` 资料夹、原子写入、受管 `AGENTS.md` 区块、资源 manifest、doctor 和旧 `.aiops/` 保留提示。
- M2 核心部分：`state.json`、revision 乐观并发检查、本地锁、checkpoint、handoff、resume、状态面板和固定交接模板。
- M4 基础部分：任务范围/完成标准/复用字段、结构化验证证据、argv 执行、超时与快照绑定、暂存区检查。
- M0 回归：已有规则不覆盖、特殊字符项目名、重复安装、用户暂停、坏状态/缺资源等核心 fixture。

## 尚未落地或尚未实测

- ZCode 插件/marketplace、Codex 生命周期 hook 和跨宿主真实 nonce 探针。
- `.aiops` 到 `guanjia` 的迁移/卸载事务。
- Windows 原生与 macOS Finder ZIP 解压实机验证。
- 现有 Husky、core.hooksPath 等提交系统的安全组合；`check` 当前提供可调用的基础检查，但安装器不会静默接管已有 hook。

## 回退入口

删除本次生成的 `guanjia/` 受管资料和 `AGENTS.md` 中的 `GUANJIA BEGIN/END` 区块即可停止新核心；旧 `.aiops/` 和受管区块外的原文不会由安装器删除。若 `guanjia/runtime/backups/` 存在，先人工比较再恢复，不能盲目覆盖用户后续修改。
