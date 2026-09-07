# 管家（guanjia）

这是一个轻量的项目管家：把当前任务、授权、暂停状态、交接内容和验证证据落到项目文件里，让编码助手换窗口或换工具后仍能核对现场继续工作。

它不是新的模型运行时，也不承诺“人格永远在线”。模型负责理解需求和给出摘要；程序负责状态格式、原子写入、状态转换、交接生成、现场核对和证据绑定。

## 先试一次

需要 Node.js 18+（推荐 22+）。在本仓库运行：

```sh
项目模板/scripts/init-project.sh /path/to/your-project "我的项目" generic
cd /path/to/your-project
node guanjia/bin/guanjia.mjs doctor --json
node guanjia/bin/guanjia.mjs status --json
```

Windows PowerShell 可用原生安装入口：

```powershell
& .\项目模板\scripts\init-project.ps1 "C:\path\to\your-project" "我的项目" generic
Set-Location "C:\path\to\your-project"
& .\guanjia\guanjia.ps1 doctor --json
```

安装后也可以使用项目内的跨平台入口；它们会自动把项目根目录传给核心程序，因此不要求当前目录必须是项目根目录：

```powershell
& .\guanjia\guanjia.ps1 doctor --json
```

```bat
guanjia\guanjia.cmd status --json
```

```sh
sh guanjia/guanjia.sh status --json
```

安装会生成一个可见的 `guanjia/` 资料夹，并把一个带 `GUANJIA BEGIN/END` 标记的短区块合并到根目录 `AGENTS.md`。已有 `AGENTS.md`、业务文件和旧 `.aiops/` 不会被覆盖或删除；发现冲突时会停止并说明原因。

然后可以这样记录第一个任务：

```sh
node guanjia/bin/guanjia.mjs task start --input '{"goal":"修复登录失败提示","allowed_paths":["src/auth/**","tests/auth/**"],"acceptance":["错误凭据显示明确提示"],"reuse":[{"path":"src/auth/errors.ts","decision":"extend","reason":"已有错误映射入口"}]}'
node guanjia/bin/guanjia.mjs checkpoint --input '{"summary":"已定位登录错误映射入口","next_action":"补充错误凭据行为测试"}'
node guanjia/bin/guanjia.mjs handoff
```

新窗口不需要再次粘贴长开启提示词。先读取 `guanjia/START.md`，再运行 `resume --json`；如果用户明确暂停，恢复命令只汇报，不会自动启动写任务。

## 当前已经实现的能力

- 跨平台安装：字面处理中文、空格、`A/B`、`R&D` 等项目名；写入前预检受管资源、状态 JSON 和 `AGENTS.md` 区块，安装过程失败会回退本次新写入，安装可重复执行且不留下半套资料；原有 `AGENTS.md` 受管区块之外的内容保留。
- 结构化状态：`state.json` 带 schema、revision、任务范围、授权、暂停、会话和现场信息；状态写入有锁、备份和原子替换。
- 交接恢复：`checkpoint`、`handoff`、`resume` 生成可读 `HANDOFF.md` 和状态面板；交接单带状态版本/现场摘要，旧交接或损坏交接会进入 `needs_review`，不盲目续跑。
- 任务契约：开始任务必须登记范围、完成标准、风险级别和复用判断；`task revise` 会递增验收版本并清空旧证据引用，低风险纯文案可走受限轻量快照验证，代码/迁移/状态任务仍需明确命令验证。
- 证据门槛：验证记录保存实际 argv、退出码、超时、输出摘要、快照摘要和任务契约摘要；失败、超时、命令不存在、过期或未执行都不能登记为完成。
- 基础提交检查：`check --scope staged --json` 会检查业务改动是否有任务、是否越界、是否有绑定当前暂存快照的 PASS 证据。
- 提交检查接入：`hooks install` 会组合已有 `pre-commit`，保留原检查，不自动接管已有 `core.hooksPath`；doctor 只在真实包装器存在时显示已启用。
- 宿主探针：`probe` / `host-event` 用唯一 nonce 记录真实事件回执，并校验 host/event 契约；配置文件、错误回执和模拟 JSON 不会被当成宿主已接入。
- 宿主薄适配：提供可审查的 ZCode 本地 marketplace、Codex 项目 hooks 模板及 Node 桥接脚本；未完成宿主安装/信任和真实回执前保持 `unverified`。
- 旧项目迁移：`migrate --from aiops` 默认只生成清单；显式 `--apply` 才复制历史资料，源 `.aiops/` 保留，重复迁移会报告冲突。
- 卸载诊断与回退：`uninstall --dry-run` 只列出受管文件、入口区块和 hook；`hooks uninstall` 仅在 wrapper 未被用户修改时恢复原 `pre-commit`，不删除状态、证据或用户修改。
- 跨平台入口：提供 PowerShell、CMD 和 POSIX shell 薄包装器；核心逻辑仍只有一份，并显式固定 `--project`。
- 宿主适配契约：补齐 generic、Qoder、WorkBuddy 的事件契约；接入事件只记录精简诊断信息，不保存原始 prompt；未收到真实 nonce 回执的宿主仍保持 `unverified`。

## 尚未宣称完成的部分

ZCode/Codex/Qoder/WorkBuddy 的真实生命周期 hook、插件信任/启用、跨宿主自动注入、Windows 原生和 macOS Finder 解压实测仍是独立验证项。仓库现在提供适配契约、可审查的 ZCode/Codex 薄适配包、跨平台入口和 nonce 探针，但必须在真实客户端中触发并收到回执后才会变成 `pass`；`doctor` 不会把生成文件冒充自动接入。

旧 `.aiops/` 资料会被保留。迁移默认 dry-run；应用时只复制到 `guanjia/archive/legacy-aiops/` 并写入迁移索引，不删除原目录，也不把旧审计升级成新的通过证据。

## 目录约定

| 路径 | 作用 |
|---|---|
| `guanjia/state.json` | 动态状态唯一权威 |
| `guanjia/HANDOFF.md` | 自动生成的可读交接快照 |
| `guanjia/README.md` | 从状态派生的状态面板 |
| `guanjia/rules/` | 短规则，按需读取；包含 DRY、测试和责任边界 |
| `guanjia/records/requests/` | 需求原话及任务契约引用 |
| `guanjia/records/evidence/` | 不可替代的验证记录 |
| `guanjia/runtime/` | 锁、备份等本地运行数据，默认不提交 |

## 设计原则

抽象与建模、模块化与信息隐藏、复用、分阶段确认与验证、风险管理与留痕、可度量与持续改进，均通过任务字段、状态转换、交接和验证记录进入执行链。技术责任落到代码/测试证据，协作责任落到接口/交接，判断责任落到评审结论和未知项；不以增加几篇口号文档代替机制。

详细实施状态见 `docs/implementation-status.md`，宿主兼容边界见 `docs/compatibility.md`。

## License

[MIT](./LICENSE)
