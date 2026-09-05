# .aiops/scripts/hooks —— 机械门禁：2 钩子 + 4 手动检查 + 2 辅助脚本（安装器 / 预算器——预算内置 pre-commit，可手动 mode=all 终验盘）

| 脚本 | 挂载位 | 拦什么 | 背景 |
|---|---|---|---|
| `pre-commit` | pre-commit | PROGRESS 新增 checker 结论行（两要素行 `- B<n> \| 台账路径`，兼容含 PASS/FAIL 旧行）引用的 verdict 台账不存在 / 未 git add / 台账缺该批号节 / 内容不含与结论行相同的 PASS-FAIL 子串；文件预算超限（七判据 A-G：直属 .aiops/docs >10、归档目录 >12、根目录非白名单 .md、子集文件在 HEAD 未删、audits 新增非台账文件（00-baseline/30-final-report 白名单）、research 在手 >3、PROGRESS >200 行） | verdict 漏交/缺失 + 文件爆炸/乱放 |
| `commit-msg` | commit-msg | PROGRESS 行数缩水（净删行）且提交信息无 `[PROGRESS压缩]` 标记 | PROGRESS 净删行未标记 |
| `check-anchor.sh` | 非钩子——主控派发任务单前手动跑（30s） | 锚点在目标文件不唯一/不存在 | Edit 空跑/错位 |
| `check-batch-limit.sh` | 非钩子——主控每次派活前手动跑（30s） | 本会话运行计数 ≥5 批仍派活（第 5 批完成即拒绝第 6 批派活；只数 `- B<n> \|` 批次行，投影/微调/并行开闸/零产出轮等记账行不计） | 单会话超批派活 |
| `check-lean.sh` | 非钩子——版本升版收尾前手动跑 | 三常读合计超硬顶或超基线 tag | 治根文件反胖 |
| `check-grill-skill.sh` | 非钩子——需求对齐拷问开工前必跑 | grilling 缺失/空/指纹不符 = 硬红；grill-me 缺失只警告 | 拷问方法论不落地 |
| `install-grill-skill.sh` | 非钩子——新项目初始化后跑一次 | 钉死 commit 下载 grill-me+grilling 到 .aiops/skills/ 并指纹自检（联网硬前提） | 写死从网上下载，防换皮 |
| `check-files-budget.sh` | **pre-commit 内置执行**（mode=diff）+ 收尾手动（mode=all） | 见 pre-commit 行内七判据（A-G） | 文件爆炸与乱放 |

## 激活（克隆后一次性执行）

```sh
git config core.hooksPath .aiops/scripts/hooks
```

钩子红 = 修问题，禁 `--no-verify`（见 AGENTS.md 提交纪律节）。

## 边权总纲（Graph 化总纲）

把大需求流程看作一张状态图：**PROGRESS 运行计数行 = 节点状态**，**机械门禁 = 状态机的边校验**——
① 无台账节不得 commit（`pre-commit` A 部分）；② 文件预算超限不得 commit（`pre-commit` B 部分）；
③ PROGRESS 不得缩水（`commit-msg`）；④ 第 5 批后不得再派活（`check-batch-limit.sh`）；
⑤ 拷问开工前 grilling 必须到位（`check-grill-skill.sh`）。
批级闭环跨会话续跑：见《主控卡.md》§一“会话纪律”条文（每批闭环落盘续跑入口，新会话读盘续走）。
教训自动注入：见《错误模式清单》使用规则条文。（各一句引用，条文不在此重写。）

## 能力边界（四条，必读）

1. **钩子1 只防"忘写/漏交"，不防"伪造"**——台账存在、已 staged、内容含同字 PASS/FAIL 即放行；
   伪造的防线 = checker 只认磁盘 + 异源（不采信 worker 粘贴输出）。
2. **钩子2 只防净删行（行数变小）**——同量换内容的防篡改不在此钩子，
   靠 checker 终验的 `git log -p` 保留检查。
3. **预算钩子只数"位置与数量"，不判内容**——文件数达标但内容臃肿（如单文件超大）不在此钩子，
   靠 check-lean.sh 字节尺子。
4. **误报出口**：门禁红先原样复现一次——复现不出 = 判据自身故障：钩子级修好判据后随本次提交
   一并入库；手动检查级在 PROGRESS 登记"疑似误报\|<脚本名>\|日期\|现象"后可继续。
   误报出口只豁免"复现不出的红"，能复现的红一律按"先修问题"处理，不构成绕过理由。

## 实现约束

脚本均为纯 POSIX sh + git 原生命令，无第三方依赖，落盘 LF。中文路径判据一律
`-c core.quotepath=false`（git 默认八进制转义中文名，直接 grep 会静默漏检）。
