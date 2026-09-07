# 管家实施状态

基线：`bystery/aiops-governance-kit` `main`，原审查提交 `01597e0c78389815ed2e5c14922983d4aa6ad32a`。

## 本次已落地

- M1 核心部分：Node 标准库安装器、可见 `guanjia/` 资料夹、原子写入、受管 `AGENTS.md` 区块、资源 manifest、doctor 和旧 `.aiops/` 保留提示。
- M2 核心部分：`state.json`、revision 乐观并发检查、本地锁、checkpoint、handoff、resume、状态面板和固定交接模板。
- M4 基础部分：任务范围/完成标准/复用字段、结构化验证证据、argv 执行、超时与快照绑定、暂存区检查。
- M0 回归：已有规则不覆盖、特殊字符项目名、重复安装、用户暂停、坏状态/缺资源等核心 fixture。
- M3/M4 增量：ZCode/Codex 适配契约、唯一 nonce 宿主探针、真实回执记录、组合式 pre-commit 安装和 doctor 生效判断。

## 尚未落地或尚未实测

- ZCode 插件/marketplace、Codex 生命周期 hook 和跨客户端自动注入；当前只有适配契约和可调用探针，尚未取得真实客户端回执。
- `.aiops` 到 `guanjia` 的迁移/卸载事务。
- Windows 原生与 macOS Finder ZIP 解压实机验证。
- Husky 等动态 hook 管理器的长期稳定性；`hooks install` 会保留已有检查并组合运行，但不会静默修改已有 `core.hooksPath` 配置。

## 回退入口

删除本次生成的 `guanjia/` 受管资料和 `AGENTS.md` 中的 `GUANJIA BEGIN/END` 区块即可停止新核心；旧 `.aiops/` 和受管区块外的原文不会由安装器删除。若 `guanjia/runtime/backups/` 存在，先人工比较再恢复，不能盲目覆盖用户后续修改。
