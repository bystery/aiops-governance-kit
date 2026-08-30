# .aiops/scripts/hooks —— 机械门禁三钩子

| 钩子 | 挂载位 | 拦什么 | 背景 |
|---|---|---|---|
| `pre-commit` | pre-commit | PROGRESS 新增 checker 结论行引用的 verdict 文件不存在 / 未 git add / 内容不含与结论行相同的 PASS-FAIL 子串 | verdict 漏交/缺失 |
| `commit-msg` | commit-msg | PROGRESS 行数缩水（净删行）且提交信息无 `[PROGRESS压缩]` 标记 | PROGRESS 净删行未标记 |
| `check-batch-limit.sh` | 非钩子——主控每次派活前手动跑（30s） | 本会话运行计数 ≥5 批仍派活（第 5 批完成即拒绝第 6 批派活） | 单会话超批派活 |
| `check-lean.sh` | 非钩子——版本升版收尾前手动跑 | 三常读合计超硬顶或超基线 tag | 治根文件反胖 |

## 激活（克隆后一次性执行）

```sh
git config core.hooksPath .aiops/scripts/hooks
```

钩子红 = 修问题，禁 `--no-verify`（见 AGENTS.md 提交纪律节）。

## 边权总纲（Graph 化总纲）

把大需求流程看作一张状态图：**PROGRESS 运行计数行 = 节点状态**，**三钩子 = 状态机的边校验**——
① 无 verdict 不得 commit（`pre-commit`）；② PROGRESS 不得缩水（`commit-msg`）；
③ 第 5 批后不得再派活，判据 ≥5 拒（`check-batch-limit.sh`）。
批级闭环跨会话续跑：见《主控卡.md》"激进放权 loop 断点续跑"条文。
教训自动注入：见《错误模式清单》使用规则条文。（各一句引用，条文不在此重写。）

## 能力边界（两条，必读）

1. **钩子1 只防"忘写/漏交"，不防"伪造"**——verdict 文件存在、已 staged、内容含同字
   PASS/FAIL 即放行；伪造一份含 PASS 的 verdict 文件照样过钩子1。
   伪造的防线 = checker 只认磁盘 + 异源（不采信 worker 粘贴输出）。
2. **钩子2 只防净删行（行数变小）**——同量换内容的防篡改不在此钩子，
   靠 checker 终验的 `git log -p` 保留检查。

## 实现约束

三脚本均为纯 POSIX sh + git 原生命令，无第三方依赖，落盘 LF。
