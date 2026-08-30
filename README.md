<div align="center">

# aiops-governance-kit

**AI 编码团队治理框架：规程 + 模板 + 机械门禁**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

</div>

一套让 AI 编码团队（规划 / 执行 / 验收 / 调研四角色）在无人值守下可靠交付的治理框架。全部由 Markdown 和 POSIX shell 钩子构成——零依赖、纯文档、不绑定任何平台，任何能读文件、跑 git 的 AI 编码工具都能直接套用。

> **English abstract:** A documentation-only governance framework that lets a team of AI coding agents (planner / worker / independent checker / researcher) deliver reliably with minimal human supervision. This is not a prompt collection: it ports decades of software-engineering governance — separation of duties, audit trails, least privilege, postmortem culture — to AI teams, in the form of three authoritative rulebooks, a project skeleton template, and mechanical git hooks. Chinese is the working language; the [glossary](#术语表) maps every term to English.

## 为什么存在

AI 写代码，快而不可信。最常见的三种翻车，这套框架的每一条规则背后都对应其中一次真实发生：

1. **跳过验收自报通过**——执行模型说"我做完了"，没人独立重跑，坏改动直接进主分支；
2. **转述变味**——需求经 AI 转述后悄悄缩水跑偏，交付物回答的是另一个问题；
3. **每一步都停下等你踩油门**——事事请示，你成了人肉循环里最慢的一环；而一旦整个放权，就回到第 1、2 种。

这套框架用"制衡"而不是"自觉"来治它们：两轮实战会话逐轮审计出 **19 条机制缺陷 + 10 条执行失误 + 3 条使用问题**，全部转化为条文；**22 起历史事故**被逐一回放，验证"新条文能拦住当初那次翻车"。

## 核心设计（五个最反直觉的决定）

1. **磁盘不认汇报**——验收角色只信自己重跑的结果；执行角色说"我做完了"不作数，其粘贴的历史输出只算线索、不算证据。
2. **不可代决清单**——花钱、动隐私、删不可恢复的数据、对外公开发布、需求变更：无论授权开到多高，这五类永远留给人。
3. **原话逐字登记**——每条需求五行入账（原话逐字粘贴 / 批注 / 终态转述 / 确认 / 交付回链），交付只对终态转述负责，治"转述变味"。
4. **净减尺子**——每次修订规则文档，新增规则数必须 ≤ 删除规则数，超了打回重写：文档不许单向变胖。
5. **分级路由**——单文件小修调度者亲做直提交，中型需求一张五行任务单，只有 >5 文件 / 动分层 / 加依赖才走全流水，治"流程税"。

## 架构

```
                ┌───────────────────────────────┐
                │          主人（人类）           │
                │   只做：拍板 / 实机点验 / 授予放权 │
                └───────────────┬───────────────┘
              白话四段式汇报 ↑    │    ↓ 不可代决选择题
                ┌───────────────▼───────────────┐
                │       主控（唯一调度枢纽）        │
                │   不写大需求功能代码，不当验收人    │
                └──┬──────────┬──────────┬──────┘
             计划单↓      任务单↓      验收转交↓     调研单↓
           ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
           │ planner │ │ worker  │ │ checker │ │ 调研者   │
           │ 只出计划  │ │ 只执行   │ │ 只验收   │ │ 只查事实 │
           └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
 ═══════════════╧═══════════╧═══════════╧═══════════╧═════════════
          磁盘 + git = 唯一通信介质（四角色互不直连、只认磁盘）
 ─────────────────────────────────────────────────────────────────
 闭环：规划 → 执行 → 独立验收 → 打包提交（代码+验收结论+进度+决策记录）
      → 记录教训 → 修正 → 再执行

 机械门禁（git hooks，可选但强烈建议）：
   pre-commit  = 没有验收结论不得 commit
   commit-msg  = 进度文件净删行必须带压缩标记
   手动检查 ×3 = 锚点唯一性 / 会话批次数上限 / 常读文档字节上限
```

## Quick Start（从复制到跑通，5 分钟量级）

```sh
# 1. 克隆本仓库
git clone https://github.com/<你的账号>/aiops-governance-kit.git
# 2. 一条命令生成新项目的治理骨架（不交互、不覆盖已有内容）
aiops-governance-kit/项目模板/scripts/init-project.sh ~/my-project 我的项目
# 3. 激活机械门禁
cd ~/my-project && git config core.hooksPath .aiops/scripts/hooks
# 4. 新开一个 AI 会话：把 主控卡.md 全文作为第一条消息发出，
#    并附一行「当前授权模式：默认」
# 5. 用一句话提第一个需求，例如："给 README 补一个安装小节"
```

## 实战证据

- 两轮实战会话逐轮审计：**19 条机制缺陷 + 10 条执行失误 + 3 条使用问题**，全部转为可执行的条文，而不是"下次注意"；
- **22 起历史事故**逐一回放验证：每条新条文都要回答"它能拦住当初那次翻车吗"；
- 首个实战项目（一个日常在用的成品，与本框架同源打磨）：**18 处已发现问题，无一漏网进入主分支**——全部被独立验收或机械门禁在入库前拦下。成品仓库整理后另行公开。

## 诚实的边界

- **单文件小改不值得用这套。** 一次改一行也要走四角色是自找的——分级路由能缓解开销，不能消除它；
- **文档是真实成本。** 规则要读、要维护、要收敛；字节上限和净减尺子是止血带，不是免费午餐；
- **验收独立性有天花板。** 理想配置是不同厂商的模型；做不到时降级为"同厂不同型号 + 机械检查占比过半"，独立性打折，框架会要求如实登记而非假装异源；
- **它假设你愿意当"放权的委托人"，而不是甩手掌柜。** 每周翻一遍代放行记账、保留事后否决权——这些动作没人能替你做。

## 文档地图

| 文件 | 内容 | English |
|---|---|---|
| `主控卡.md` | 调度总入口：会话入口、需求分级、汇报协议 | Coordinator Card |
| `放权机制.md` | 授权三档与各环节把关人映射（唯一事实源） | Authority & Delegation |
| `智能体角色定义.md` | 四角色定义 + 投影生成规程 | Agent Role Definitions |
| `项目模板/说明-如何使用本项目模板.md` | 模板包使用说明 | Template Usage Guide |
| `项目模板/AGENTS.md.template` | 目标项目根目录的指针文件模板 | Repo Pointer Template |
| `项目模板/.aiops/` | 治理文档骨架（进度/待办/决策/读集等模板） | Governance Skeleton Templates |
| `项目模板/.aiops/scripts/hooks/` | 机械门禁钩子与检查脚本 | Mechanical Gate Hooks |
| `项目模板/scripts/init-project.sh` | 一键生成 `.aiops/` 骨架 | Project Initializer |

## 术语表

| 术语 | 白话 |
|---|---|
| 主人（owner） | 人类项目所有者——一切工作的委托人与最终拍板人 |
| 主控（coordinator) | 唯一与主人对话、负责调度其余角色的主 AI |
| 四角色 | planner（只出计划）/ worker（只执行）/ checker（独立验收）/ 调研者（带出处的查证） |
| 放权（delegation） | 主人把部分把关权授予主控的三档授权：默认 / 基础放权 / 激进放权 |
| verdict | checker 出具的书面验收结论文件，是 commit 的前置条件 |
| 补刀 | 主控对小额 FAIL 的直接小修；规则是先落复现手段跑出红，再动手 |
| 投影（projection） | 从角色定义机械摘录生成、单一角色可见的 prompt 文件 |
| 门禁 | git hook 机械检查，红就是红，禁止绕过 |
| PLAYBOOK / PROGRESS | 大需求总控手册 / 项目唯一进度现场文件 |

## FAQ

**Q：这和"给 AI 的 prompt 合集"有什么区别？**
prompt 合集给你台词，这套给你制度：四角色互相制衡、验收只认磁盘、每次提交强制携带验收结论；规则之间有权重排序和冲突处理条款，不是一堆平行叮嘱。

**Q：需要什么环境？**
任意能读文件、跑 git 的 AI 编码工具（CLI 或 IDE 内置 agent 均可）。钩子是纯 POSIX shell + git 原生命令，无第三方依赖。

**Q：文档全是中文，非中文用户能用吗？**
能。上方术语表与文档地图给全英文对应；条文本身建议用你团队的工作语言维护。

**Q：会把小任务搞得很重吗？**
不会——分级路由就是为此设计的：小修直提、中型一张任务单，只有大需求才进全流水。

**Q：可以不装钩子吗？**
可以，门禁独立于规程。但没有门禁，"跳过验收自报通过"只能靠自觉——那正是本框架要治的第一号病。

## License

[MIT](./LICENSE)
