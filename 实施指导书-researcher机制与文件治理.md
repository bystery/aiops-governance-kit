# 实施指导书：researcher 机制改造 + 文件治理

> 依据：《需求书-researcher机制与文件治理.md》（项目根，未跟踪文件，改动依据的唯一来源）。
> 项目所有者 2026-09-04 拍板的 8 项决议在此全部落地（多宿主通用 / 主控逐字转发 / 联网硬前提 /
> MIT 许可 / 临时件不计预算 / 先入库留证再删 / 回填机械门禁 / 净减尺子删旧抵消+记账）。
> 执行者（AI）规矩：每个 Edit 前必须先 Read 目标文件拿最新内容；锚点不匹配时以盘中实际文本为准
> 重新复制；禁止 `--no-verify`；禁止改本指导书"禁改清单"里的文件；每批次做完跑该批次验证命令，
> 全绿才进下一批。

---

## 0. 需求 → 改动映射总表（先看这张，再动手）

| 需求书条目 | 落点（文件 × 动作） |
|---|---|
| 1 grill-me 独立 skill、写死从网上下载 | 新增 `install-grill-skill.sh`（钉死 commit + 双指纹）+ `check-grill-skill.sh`（grilling 缺失=硬红）；主控卡 §二第3句、§四[0] 引用 |
| 2 researcher 接管对齐（分流路由） | 主控卡 §四[0]；角色定义"调研者"节新增"对齐特例"小节（**主控逐字转发，无直连例外**） |
| 3 参考式拷问（三类用户、≤3 轮） | 角色定义"对齐特例"内（同上一处改动） |
| 4 一次一子集文件、合并后删 | 角色定义"对齐特例·产出纪律"；主控卡 §四[0]；pre-commit 内置判据（入库留证后下一 commit 必删） |
| 5 文件爆炸（台账制 + 预算门禁） | verdict 全面改台账：pre-commit 重写（含账本文本解析修正）、角色定义 checker 两处、审计报告模板、PLAYBOOK 模板三处、PROGRESS 模板两处、hooks README、模板说明、AGENTS 模板；新增 `check-files-budget.sh` 并**并入 pre-commit 执行**（非手动） |
| 6 文件归一处 | pre-commit 内置根目录白名单判据（`-c core.quotepath=false`，中文名有效） |
| 7 交付回链时序（实现后才回填） | 主控卡"需求五行登记制"⑤栏定义；PROGRESS 模板字段行；终验机械判据（见批次6 终验清单） |

涉及文件全集：新增 3 个脚本；修改 10 个文件（主控卡、角色定义、pre-commit、hooks README、
PROGRESS 模板、审计报告模板、PLAYBOOK 模板、读集模板、模板说明、AGENTS 模板）；README 改 3 小处。
**放权机制.md / EVIDENCE.md / LICENSE / .gitignore / init-project.sh / 宿主映射表.md.template 零改动**
（init 脚本用 `cp hooks/*` 整目录拷贝，新脚本自动随骨架分发，无需改）。

### 相对旧稿的三处修正（执行者须知，全部已实测）

1. **台账中文名截断 bug**：原 pre-commit 用 `grep -o '.aiops/docs/audits/[A-Za-z0-9._/-]*'` 提路径，
   遇到 `ledger-日常.md` 只提取到 `ledger-`，会假红拦下一切含中文台账名的 commit。
   改 `sed -n 's#.*\(\.aiops/docs/audits/[^ |]*\).*#\1#p'`（已实测两种台账名都取全）。
2. **A 项递归计数 bug**：原 `find` 未按深度剪枝，把 `decisions/`（ADR 永留，铁律6）算进预算，
   历史项目回放必假红。改 **索引路径直属模式**：`ls-files --cached | grep '\.aiops/docs/[^/]*\.md$'`
   只数直属文件、子目录天然排除，且以索引为准不受工作区脏文件干扰（已实测：init 后基线 = 3；
   find 的 `-maxdepth 1` 仅保留在 F 判据 research 目录计数里）。
3. **中文文件名全漏检 bug**：git 默认 `core.quotepath=true`，中文路径输出为八进制转义，
   原 C/D 项 grep 全部静默漏过（已实测：默认 0 命中、`-c core.quotepath=false` 后 1 命中）。
   本稿所有路径判据统一前置 `git -c core.quotepath=false`。

另外：预算脚本从"手动跑"改为 **pre-commit 内置执行**（需求5 判据本身的判据：钩子级才算落地）；
旧稿"手动检查 ×6"实为 5 个手动脚本 + 1 个钩子职责，重算为 **×4**（台账节在位归 pre-commit）。

---

## 批次1：新增三个脚本 + 沙箱实测

### 1.1 新建 `项目模板/.aiops/scripts/hooks/install-grill-skill.sh`

内容全文（逐字写入）：

```sh
#!/bin/sh
# grill-me 技能安装（来源写死：mattpocock/skills，钉死 commit；装到 .aiops/skills/，装完自检指纹）
# 用法：在目标项目根运行  sh .aiops/scripts/hooks/install-grill-skill.sh
# 联网是硬前提（项目所有者拍板3）——不支持无网/内网；无 curl 时 AI 用自身网页抓取按本文件头部 URL
# 逐字取回写入，再跑本脚本复核指纹（幂等）。
# 许可：mattpocock/skills 为 MIT（Copyright (c) 2026 Matt Pocock）——运行时下载不构成再分发，须署名。
set -u
[ -d .aiops ] || { echo "[install-grill] 拦下：请在项目根运行（找不到 .aiops/）。"; exit 2; }
mkdir -p .aiops/skills/grill-me .aiops/skills/grilling

SHA=3cca18b368ae95cdbdebbff572ccafa662551015
API="https://api.github.com/repos/mattpocock/skills/contents/skills/productivity"
RAW="https://raw.githubusercontent.com/mattpocock/skills/$SHA/skills/productivity"
JSD="https://cdn.jsdelivr.net/gh/mattpocock/skills@$SHA/skills/productivity"

fetch() {
    name=$1; dest=".aiops/skills/$name/SKILL.md"
    if curl -sfL --max-time 40 -H "Accept: application/vnd.github.raw" "$API/$name/SKILL.md?ref=$SHA" -o "$dest" 2>/dev/null && [ -s "$dest" ]; then
        echo "[install-grill] $name <- api.github.com OK"; return 0
    fi
    for u in "$RAW/$name/SKILL.md" "$JSD/$name/SKILL.md"; do
        if curl -sfL --max-time 40 "$u" -o "$dest" 2>/dev/null && [ -s "$dest" ]; then
            echo "[install-grill] $name <- $u OK"; return 0
        fi
    done
    echo "[install-grill] 红：$name 三通道全失败（URL：$API/$name/SKILL.md?ref=$SHA）。" >&2
    return 1
}

ok=0
fetch grill-me || ok=1
fetch grilling || ok=1
[ "$ok" -ne 0 ] && exit 1
sh "$(dirname "$0")/check-grill-skill.sh" || exit 1
echo "[install-grill] 完成。把 .aiops/skills/ 一并 commit（后续会话离线可用）。"
exit 0
```

### 1.2 新建 `项目模板/.aiops/scripts/hooks/check-grill-skill.sh`

```sh
#!/bin/sh
# grill-me 技能门槛（需求对齐拷问开工前必跑；grilling 缺 = 硬红，禁止开始拷问）
# 判据：grilling/SKILL.md 存在、非空、与钉死指纹一致 = 必过项；
#       grill-me/SKILL.md 只警告（它是 7 词转发壳 + disable-model-invocation: true，
#       缺失不影响方法论本体；真失效的是 grilling 缺席——即需求书1 原话"有时根本不 grill"的根因）
set -u
# 不切目录：check 函数路径已含 .aiops/ 前缀，cd .aiops 会让路径变成 .aiops/.aiops/... 永远找不到
err=0
warn=0
check() {
    f=$1; must=$2; fp=$3
    if [ ! -f "$f" ]; then
        [ "$must" -eq 1 ] && { echo "[grill-skill] 红：缺 $f。先跑 .aiops/scripts/hooks/install-grill-skill.sh 安装。" >&2; err=1; }
        [ "$must" -eq 0 ] && { echo "[grill-skill] 警告：缺 $f（仅警告——见脚本头注释）。" >&2; warn=1; }
        return
    fi
    [ -s "$f" ] || { echo "[grill-skill] 红：$f 是空文件，重装。" >&2; err=1; return; }
    [ "$(git hash-object "$f" 2>/dev/null)" = "$fp" ] || {
        echo "[grill-skill] 红：$f 指纹不符（得 $(git hash-object "$f" 2>/dev/null)，期望 $fp）——内容与钉死版本不一致，重装。" >&2
        err=1
    }
}
check .aiops/skills/grilling/SKILL.md 1 8ca78c6d8f901aab0c5a1f896034b70e666ff2a3
check .aiops/skills/grill-me/SKILL.md 0 3947ff9c4ad980d14fc07fccbf659d47c114e81d
[ "$warn" -eq 1 ] && echo "[grill-skill] 注：grill-me 缺失只警告；grilling 在位即可开工拷问。"
[ "$err" -eq 0 ] && echo "[grill-skill] 绿：grilling 技能就位（方法论可用）。"
exit "$err"
```

### 1.3 新建 `项目模板/.aiops/scripts/hooks/check-files-budget.sh`

文件预算判据体，**由 pre-commit 内置执行**（`mode=diff` 看暂存区），也可手动跑全量
（`mode=all` 看 HEAD）。两模式共享同一批判据，杜绝"手动绿、钩子红"分叉。

```sh
#!/bin/sh
# 文件预算门禁（文件爆炸/乱放/临时件长驻——需求书4/5/6；pre-commit 内置执行 + 可手动全量跑）
# 用法：check-files-budget.sh [mode=diff]  默认 mode=diff（与 pre-commit 同口径：看暂存区）
#       check-files-budget.sh mode=all     全量盘（HEAD 口径，终验/收尾用）
# 判据：
#   A. .aiops/docs/ 直属文件 ≤ 10（decisions/audits/research/archive 子目录不算——
#      铁律6 ADR 永留 decisions/；大需求期 3 常驻+6 过程文档=9，留 1 格；20 份 PLAYBOOK 分片不可能）
#   B. 归档目录 archive/*-大需求/ 每个 ≤ 12
#   C. 根目录 .md 白名单：只许 AGENTS.md / README.md（mode=all 连存量一起查）
#   D. 临时件判据：.aiops/docs/需求登记子集.md 在 HEAD 却未随本次提交删除 = 红
#      （先入库留证、在 HEAD 期间所有提交被拦、随下一 commit 删除——拍板6；读 HEAD 不读索引：
#       入库 commit 时文件已在索引，索引口径会把"留证入库"本身误判红）
#   E. audits/ 新增 .md 必须带 ledger- 前缀（台账制；mode=diff 只查本次新增 = 老项目存量 check-* 豁免）
#   F. research 报告（research_*.md）在手 ≤ 3（执行期并行上限），大需求终验清零靠批次6 终验清单
#   G. PROGRESS.md > 200 行 = 硬红（120 行黄牌之外的真红线）
# 中文路径判据统一 -c core.quotepath=false（git 默认八进制转义会把中文名变成引号串，漏检）
set -u
mode=${1:-diff}
err=0

GITQ="git -c core.quotepath=false"
if $GITQ rev-parse --git-dir >/dev/null 2>&1; then
    # 本次变更的路径集：diff 模式看暂存区快照（git ls-files --cached = 提交后将存在的文件集，
    # 与工作区独立——pre-commit 里工作区可能比暂存区新，找文件数必须以索引为准）
    if [ "$mode" = "diff" ]; then
        paths=$($GITQ ls-files --cached 2>/dev/null | tr -d '\r')
        added=$($GITQ diff --cached --name-only --diff-filter=A 2>/dev/null | tr -d '\r')
        deleted=$($GITQ diff --cached --name-only --diff-filter=D 2>/dev/null | tr -d '\r')
    else
        paths=$($GITQ ls-files 2>/dev/null | tr -d '\r')
        added=$paths          # mode=all：全量盘，无"新增"概念——全部当新增查
        deleted=""
    fi

    # A. .aiops/docs/ 直属文件预算（看索引；子目录文件排除）
    docs_count=$(printf '%s\n' "$paths" | grep -c '\.aiops/docs/[^/]*\.md$' || true)
    if [ "${docs_count:-0}" -gt 10 ]; then
        echo "[files-budget] 红：.aiops/docs/ 直属文件 ${docs_count} 个 > 10。归档/删除后再提交（大需求期文档只许 6 份在根）。" >&2
        err=1
    fi

    # B. 归档目录预算
    for d in .aiops/docs/archive/*-大需求; do
        [ -d "$d" ] || continue
        m=$(find "$d" -type f | wc -l | tr -d ' ')
        [ "$m" -gt 12 ] && { echo "[files-budget] 红：归档 $d 有 $m 个文件 > 12。" >&2; err=1; }
    done

    # F. research 报告在手数
    r_count=$(find .aiops/docs/research -maxdepth 1 -name 'research_*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "${r_count:-0}" -gt 3 ]; then
        echo "[files-budget] 红：.aiops/docs/research/ 在手报告 $r_count 份 > 3。归档或删除已采信的。" >&2
        err=1
    fi

    # G. PROGRESS 行数硬红
    p_lines=$(tr -d '\r' < .aiops/docs/PROGRESS.md 2>/dev/null | wc -l | tr -d ' ')
    if [ "${p_lines:-0}" -gt 200 ]; then
        echo "[files-budget] 红：.aiops/docs/PROGRESS.md ${p_lines} 行 > 200 硬顶。先压缩（收尾动作）再提交。" >&2
        err=1
    fi

    # C. 根目录 .md 白名单（mode=diff 查本次新增；mode=all 查全部）
    bad_root=$(printf '%s\n' "$added" | grep -v '/' | grep '\.md$' | grep -v '^AGENTS.md$' | grep -v '^README.md$' || true)
    if [ -n "$bad_root" ]; then
        echo "[files-budget] 红：根目录新增治理类 .md（只许 AGENTS.md / README.md）：$(printf '%s\n' "$bad_root" | tr '\n' ' ')" >&2
        err=1
    fi

    # D. 需求登记子集：在 HEAD 却未在本次删除 = 红（先入库留证，下一 commit 必须删，拍板6）
    #    三态：HEAD 无此文件 = 首次入库放行；在 HEAD + 本次未删 = 红；在 HEAD + 本次删 = 放行。
    #    mode=all 无"本次删除"概念 → 在 HEAD 即红（终验/收尾时它本应已删，此时不删没有理由）。
    subset_in_head=$($GITQ ls-tree -r --name-only HEAD -- .aiops/docs/需求登记子集.md 2>/dev/null | wc -l | tr -d ' ')
    subset_deleted=$(printf '%s\n' "$deleted" | grep -c '\.aiops/docs/需求登记子集\.md' || true)
    if [ "${subset_in_head:-0}" -ge 1 ] && [ "${subset_deleted:-0}" -eq 0 ]; then
        echo "[files-budget] 红：.aiops/docs/需求登记子集.md 在 HEAD 而本次提交未删除它——入库留证后必须随下一 commit 删。" >&2
        err=1
    fi

    # E. audits/ 下 .md 必须 ledger- 前缀（台账制）
    bad_audit=$(printf '%s\n' "$added" | grep '\.aiops/docs/audits/[^/]*\.md$' | grep -v '/ledger-' || true)
    if [ -n "$bad_audit" ]; then
        echo "[files-budget] 红：audits/ 新增非台账文件（只许 ledger-* 一份/大需求）：$(printf '%s\n' "$bad_audit" | tr '\n' ' ')" >&2
        err=1
    fi
else
    echo "[files-budget] 警告：不在 git 仓库，A-G 全部跳过（本脚本为 git 门禁，无仓库无意义）。"
fi

[ "$err" -eq 0 ] && echo "[files-budget] 绿：文件预算内（mode=$mode）。"
exit "$err"
```

### 1.4 批次1 沙箱实测（必须做；测完即弃，与真仓库无关）

```sh
# 沙箱建项目骨架（基线 = .aiops/docs/ 直属 3 文件：PROGRESS/backlog/错误模式清单）
rm -rf /tmp/gk-sandbox && sh "项目模板/scripts/init-project.sh" /tmp/gk-sandbox 沙箱项目
cd /tmp/gk-sandbox
git init -q && git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm init

# 绿1：安装下载 + 指纹自检（主通道 api.github.com 已实测逐字可达，钉死 commit 3cca18b3…）
sh .aiops/scripts/hooks/install-grill-skill.sh     # 期望：两行 OK + check 绿，退出 0
# 红1：grilling 缺失 = 硬红；grill-me 缺失只警告（退出仍 0）
rm .aiops/skills/grilling/SKILL.md
sh .aiops/scripts/hooks/check-grill-skill.sh       # 期望：红（缺 grilling），退出 1
rm .aiops/skills/grill-me/SKILL.md
sh .aiops/scripts/hooks/check-grill-skill.sh       # 期望：红（grilling 仍缺）；再删 grill-me 前先记录
sh .aiops/scripts/hooks/install-grill-skill.sh     # 装回来，期望退出 0（指纹全对）
# 红2：指纹篡改 = 硬红
echo hacked >> .aiops/skills/grilling/SKILL.md
sh .aiops/scripts/hooks/check-grill-skill.sh       # 期望：红（指纹不符），退出 1
sh .aiops/scripts/hooks/install-grill-skill.sh     # 重装覆盖，期望退出 0

# 红3/绿2：预算 A 项（直属 >10：基线 3 + 造 8 个 = 11；判据读索引——必须 add 后才会红）
for i in 1 2 3 4 5 6 7 8; do echo x > ".aiops/docs/f$i.md"; done
git add -A && sh .aiops/scripts/hooks/check-files-budget.sh mode=all    # 期望：红（11 > 10），退出 1
git rm -q --cached .aiops/docs/f*.md && rm .aiops/docs/f*.md
sh .aiops/scripts/hooks/check-files-budget.sh mode=all                 # 期望：绿，退出 0
# 红4：预算 C 项中文名根目录文件（quotepath 回归测试——旧稿此判据必漏；同需 add）
echo x > 散落文件.md
git add 散落文件.md && sh .aiops/scripts/hooks/check-files-budget.sh mode=all    # 期望：红（根目录散落），退出 1
git rm -q --cached 散落文件.md && rm 散落文件.md
# 红5a：预算 E 项放行侧（audits/ 新增 ledger-* 台账文件 = 通过）
mkdir -p .aiops/docs/audits && echo x > .aiops/docs/audits/ledger-日常.md
git add .aiops/docs/audits/ledger-日常.md && sh .aiops/scripts/hooks/check-files-budget.sh mode=all    # 期望：绿（ledger 合规）
# 红5b：预算 E 项拦截侧（audits/ 新增 check-B1 文件 = 红——旧"每批一文件"制被机械禁止）
echo x > .aiops/docs/audits/check-B1-0904.md
git add .aiops/docs/audits/check-B1-0904.md && sh .aiops/scripts/hooks/check-files-budget.sh mode=all  # 期望：红（非台账文件），退出 1
git rm -q --cached .aiops/docs/audits/check-B1-0904.md && rm .aiops/docs/audits/check-B1-0904.md
# 红6：预算 G 项（PROGRESS >200 行；grep -c 后索引复原 = 绿）
python - <<'PY' 2>/dev/null || awk 'BEGIN{for(i=1;i<=220;i++)print "- x"}' > .aiops/docs/PROGRESS.md
for i in range(220): print("- x")
PY
git add -A && sh .aiops/scripts/hooks/check-files-budget.sh mode=all    # 期望：红（行数 >200），退出 1
# 复原注意：禁用 checkout --（它只把索引复制回工作区，此刻索引 = 220 行版 = 复原完仍红）；
# 必须 checkout HEAD --（HEAD → 索引 + 工作区，一步到位）
git -c core.quotepath=false checkout HEAD -- .aiops/docs/PROGRESS.md
sh .aiops/scripts/hooks/check-files-budget.sh mode=all                 # 期望：绿，退出 0
# 收尾提交：把 ledger-日常.md 等测试残留入库，供批次2 同一沙箱续测（批次2 的红1/绿1 会基于此再动）
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 沙箱批次1收尾（台账文件入库）"
```

全部符合预期才进批次2。任何一步输出与预期不符 → 停下修脚本，禁止带红前进。

---

## 批次2：pre-commit 重写（台账解析 + 预算内置）+ 钩子文档

### 2.1 重写 `项目模板/.aiops/scripts/hooks/pre-commit`（整文件替换）

用下面全文**整体替换**原文件（原文件是"每批一文件 + ASCII 路径提取"口径，台账制下逻辑已变；
先 `cp` 备份到工作区外再替换）：

```sh
#!/bin/sh
# 钩子1（pre-commit）：A) checker 结论行 verdict 台账校验  B) 文件预算门禁（内置执行）
# 拦截：PROGRESS 新增结论行引用的台账不存在 / 未 git add / 不含该批号节（## B<n>）/
#       内容不含与结论行相同的 PASS-FAIL 子串；文件预算超限（见 check-files-budget.sh）
# 能力边界：只防"忘写/漏交"，不防"伪造"——伪造的防线 = checker 只认磁盘 + 异源。
# 中文路径须知：git 默认 core.quotepath=true 把中文名转义成八进制引号串——所有判据 -c quotepath=false。
set -u
err=0

# 台账文件须是 ledger-*（预算脚本 E 项拦新增非台账；这里兜底一次）
added=$(git -c core.quotepath=false diff --cached --name-only --diff-filter=A 2>/dev/null | tr -d '\r')
bad_audit=$(printf '%s\n' "$added" | grep '\.aiops/docs/audits/[^/]*\.md$' | grep -v '/ledger-' || true)
if [ -n "$bad_audit" ]; then
    echo "[pre-commit] 拦下：audits/ 新增非台账文件（台账制：每大需求一份 ledger-*）：$(printf '%s\n' "$bad_audit" | tr '\n' ' ')" >&2
    err=1
fi

# A 部分：PROGRESS 新增 checker 结论行 → 台账存在性 + 批号节 + PASS/FAIL 子串
prog=$(git -c core.quotepath=false diff --cached -- .aiops/docs/PROGRESS.md 2>/dev/null | tr -d '\r')
lines=$(printf '%s\n' "$prog" | grep '^+' | grep '|[[:space:]]*\(PASS\|FAIL\)[[:space:]]*|' | grep '\.aiops/docs/audits/' | grep -v '示例行' || true)

# （示例行）排除项：PROGRESS 模板自带的示例结论行不参与校验——否则新项目首次 commit 即被示例卡死
# 暂存区没有新增 checker 结论行 → A 部分无事可查（B 部分照常）
if [ -n "$lines" ]; then
    list=$(mktemp)
    printf '%s\n' "$lines" > "$list"
    while IFS= read -r line; do
        word=$(printf '%s\n' "$line" | grep -o '\(PASS\|FAIL\)' | head -n 1)
        path=$(printf '%s\n' "$line" | sed -n 's#.*\(\.aiops/docs/audits/[^ |]*\).*#\1#p' | head -n 1)
        batch=$(printf '%s\n' "$line" | grep -o 'B[0-9][0-9]*' | head -n 1)

        if [ -z "$path" ]; then
            echo "[pre-commit] 拦下：PROGRESS 新增结论行提取不到台账路径：$line" >&2
            echo "            先补写台账（.aiops/docs/audits/ledger-*）并 git add，再提交。" >&2
            err=1
            continue
        fi
        # 台账必须已暂存（与 PROGRESS 结论行同 commit），并真实存在于工作区
        if [ -z "$(git ls-files --cached -- "$path")" ]; then
            echo "[pre-commit] 拦下：台账存在但没有 git add：$path" >&2
            echo "            台账必须与 PROGRESS 结论行进同一个 commit。" >&2
            err=1
            continue
        fi
        if [ ! -f "$path" ]; then
            echo "[pre-commit] 拦下：结论行引用已暂存的台账路径，但工作区无此文件：$path" >&2
            err=1
            continue
        fi
        if [ -z "$word" ] || ! grep -q "$word" "$path"; then
            echo "[pre-commit] 拦下：台账文件内容不含与结论行相同的 $word 子串：$path" >&2
            echo "            核对台账结论与 PROGRESS 登记一致后重试。" >&2
            err=1
            continue
        fi
        # 台账须含该批号节（## B<n>）——旧"每批一文件"制的文件存在性检查在此被节存在性取代
        case "$path" in
            *ledger-*)
                if [ -n "$batch" ] && ! tr -d '\r' < "$path" | grep -q "^## $batch"; then
                    echo "[pre-commit] 拦下：台账 $path 内找不到该批号的节（## $batch）。" >&2
                    echo "            checker 须在台账内为该批追加一节后再提交。" >&2
                    err=1
                    continue
                fi
                ;;
        esac
    done < "$list"
    rm -f "$list"
fi

# B 部分：文件预算门禁（需求书4/5/6——钩子级执行才算落地）
sh "$(dirname "$0")/check-files-budget.sh" mode=diff || err=1

[ "$err" -eq 0 ] || exit 1
exit 0
```

**pre-commit 行为实测**（沙箱续用批次1 的 /tmp/gk-sandbox；`<本仓库根>` = 本指导书所在仓库根）：

```sh
cd /tmp/gk-sandbox && git config core.hooksPath .aiops/scripts/hooks
# 换装：沙箱 hooks 目录还是 init 时的旧 pre-commit——先把批次2 新钩子复制进去再测
# （cp 覆盖已跟踪文件不改可执行位；chmod 保底。换装提交本身跑一遍新钩子 = 冒烟）
cp <本仓库根>/项目模板/.aiops/scripts/hooks/pre-commit .aiops/scripts/hooks/pre-commit
chmod +x .aiops/scripts/hooks/pre-commit
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 换装新 pre-commit"   # 期望：通过（PROGRESS 无新增结论行 + 预算绿 = 新钩子冒烟绿）
# 红1：台账缺该批节（台账先含"结论：PASS"→ 精确红因 = 缺 ## B1 节，不会被"不含 PASS 子串"抢先拦）
printf -- '- B1 | 2026-09-04 | PASS | 证据：示例 | .aiops/docs/audits/ledger-日常.md\n' >> .aiops/docs/PROGRESS.md
printf '# ledger-日常\n结论：PASS\n' > .aiops/docs/audits/ledger-日常.md
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 应被拦（台账缺 B1 节）"   # 期望：拦下（报"找不到 ## B1 节"），退出非 0；暂存区保留，绿1 直接续用
# 绿1：补上 B1 节后通过（引用的台账进了同一次 commit，结论 PASS 与节内一致）
printf '## B1 2026-09-04\n结论：PASS\n' >> .aiops/docs/audits/ledger-日常.md
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 台账节齐，应通过"            # 期望：commit 成功
# 红2：结论行 PASS 而台账只有 FAIL 字样（钩子按整份台账找同串——登记行引用的台账必须含 PASS）
#     构造：追加新批号 B9 行并引用全新台账 ledger-临时.md（只有 FAIL）——别用改号法（sed B1→B2 后
#     结论行仍指向含 B1 PASS 节的 ledger-日常.md，台账里 PASS 串在位 = 拦不住，属构造问题不是钩子问题）
printf -- '- B9 | 2026-09-04 | PASS | 证据：示例 | .aiops/docs/audits/ledger-临时.md\n' >> .aiops/docs/PROGRESS.md
printf '## B9 2026-09-04\n结论：FAIL\n' > .aiops/docs/audits/ledger-临时.md
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 应被拦（登记 PASS 台账只 FAIL）"   # 期望：拦下（报"不含与结论行相同的 PASS 子串"），退出非 0
# 复原：删 B9 行 + 删临时台账（PROGRESS 净行数回 HEAD 原位 → commit-msg 无净删不拦，无需压缩标记）
rm .aiops/docs/audits/ledger-临时.md && sed -i '/B9/d' .aiops/docs/PROGRESS.md
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 复原"
# 红3：预算内置（直属 >10 拦 commit——基线 3 + 造 8 个 = 11）
for i in 1 2 3 4 5 6 7 8; do echo x > ".aiops/docs/f$i.md"; done
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 应被预算拦"                       # 期望：pre-commit 拦下（预算红），退出非 0
rm .aiops/docs/f*.md && git add -A
git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 复原"
# 红4：需求登记子集三态（D 判据读 HEAD：入库放行 / 空提交拦截 / 删除放行）
mkdir -p .aiops/docs && printf '# 子集\n' > .aiops/docs/需求登记子集.md
git add -A && git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 子集入库（留证）应通过"            # 期望：通过（HEAD 尚无子集 = 首次入库不拦）
git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 应被拦（子集在 HEAD 未删仍提交）" --allow-empty   # 期望：拦下（在 HEAD 却未删），退出非 0
rm .aiops/docs/需求登记子集.md && git add -A
git -c user.name=sandbox -c user.email=s@x -c core.quotepath=false commit -qm "test: 子集删除，应通过"                            # 期望：通过
```

### 2.2 `项目模板/.aiops/scripts/hooks/README.md` 整文件替换

原表是"三钩子 + 三脚本"旧口径（已加两个脚本却没更新标题与边权总纲，属漏改）；整体替换：

```markdown
# .aiops/scripts/hooks —— 机械门禁：2 钩子 + 4 手动检查 + 2 辅助脚本（安装器 / 预算器——预算内置 pre-commit，可手动 mode=all 终验盘）

| 脚本 | 挂载位 | 拦什么 | 背景 |
|---|---|---|---|
| `pre-commit` | pre-commit | PROGRESS 新增 checker 结论行引用的 verdict 台账不存在 / 未 git add / 台账缺该批号节 / 内容不含与结论行相同的 PASS-FAIL 子串；文件预算超限（七判据 A-G：直属 .aiops/docs >10、归档目录 >12、根目录非白名单 .md、子集文件在 HEAD 未删、audits 新增非台账文件、research 在手 >3、PROGRESS >200 行） | verdict 漏交/缺失 + 文件爆炸/乱放 |
| `commit-msg` | commit-msg | PROGRESS 行数缩水（净删行）且提交信息无 `[PROGRESS压缩]` 标记 | PROGRESS 净删行未标记 |
| `check-anchor.sh` | 非钩子——主控派发任务单前手动跑（30s） | 锚点在目标文件不唯一/不存在 | Edit 空跑/错位 |
| `check-batch-limit.sh` | 非钩子——主控每次派活前手动跑（30s） | 本会话运行计数 ≥5 批仍派活（第 5 批完成即拒绝第 6 批派活） | 单会话超批派活 |
| `check-lean.sh` | 非钩子——版本升版收尾前手动跑 | 三常读合计超硬顶或超基线 tag | 治根文件反胖 |
| `check-grill-skill.sh` | 非钩子——需求对齐拷问开工前必跑 | grilling 缺失/空/指纹不符 = 硬红；grill-me 缺失只警告 | 拷问方法论不落地（需求书1） |
| `install-grill-skill.sh` | 非钩子——新项目初始化后跑一次 | 钉死 commit 下载 grill-me+grilling 到 .aiops/skills/ 并指纹自检（联网硬前提） | 需求书1：写死从网上下载 |
| `check-files-budget.sh` | **pre-commit 内置执行**（mode=diff）+ 收尾手动（mode=all） | 见 pre-commit 行内七判据（A-G） | 文件爆炸与乱放（需求书4/5/6） |

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
批级闭环跨会话续跑：见《主控卡.md》"激进放权 loop 断点续跑"条文。
教训自动注入：见《错误模式清单》使用规则条文。（各一句引用，条文不在此重写。）

## 能力边界（三条，必读）

1. **钩子1 只防"忘写/漏交"，不防"伪造"**——台账存在、已 staged、内容含同字 PASS/FAIL 即放行；
   伪造的防线 = checker 只认磁盘 + 异源（不采信 worker 粘贴输出）。
2. **钩子2 只防净删行（行数变小）**——同量换内容的防篡改不在此钩子，
   靠 checker 终验的 `git log -p` 保留检查。
3. **预算钩子只数"位置与数量"，不判内容**——文件数达标但内容臃肿（如单文件超大）不在此钩子，
   靠 check-lean.sh 字节尺子。

## 实现约束

脚本均为纯 POSIX sh + git 原生命令，无第三方依赖，落盘 LF。中文路径判据一律
`-c core.quotepath=false`（git 默认八进制转义中文名，直接 grep 会静默漏检）。
```

### 2.3 批次2 验证

```sh
cd <本仓库根>
# 1. 本批替换件不再教旧 verdict 文件命名（check-<批次>/check-<步骤或阶段 字样清零）。
#    注意：只扫本批改过的两个文件——其余文件（PLAYBOOK/审计报告模板/说明/角色定义）批次3-5 才轮到，
#    此刻全仓扫会假红；全仓旧口径清零在批次6 终验清单 #1
grep -c 'check-<批次\|check-<步骤或阶段' 项目模板/.aiops/scripts/hooks/pre-commit 项目模板/.aiops/scripts/hooks/README.md   # 期望：各输出 0
# 2. 台账制 + 预算内置已进钩子
grep -c '台账' 项目模板/.aiops/scripts/hooks/pre-commit 项目模板/.aiops/scripts/hooks/README.md   # 期望：各 ≥1
grep -c 'check-files-budget.sh' 项目模板/.aiops/scripts/hooks/pre-commit                         # 期望：≥1（B 部分内置执行）
# 3. 新脚本齐 + 可执行位在（批次1 产物；pre-commit B 部分依赖 budget 脚本）
ls -l 项目模板/.aiops/scripts/hooks/ | grep -E 'install-grill|check-grill|check-files-budget|pre-commit'   # 期望：四个都在，权限列含 x
```

---

## 批次3：主控卡.md 四处 Edit（需求1/2/4/7）

### Edit A（§二第3句——分流路由 + 技能门禁）

old_string：

```
3. **需求对齐第一责任人**：grill-me 式拷问，每问附推荐+理由；事实核实统一派调研者（带出处），主控汇总裁决，决定项目所有者做。
```

new_string：

```
3. **需求对齐分流路由**：需求明确的中小需求主控直接登记（五行登记制），不派调研者；说不清的整单转调研者对齐特例（§四[0]）。凡拷问一律先跑 `.aiops/scripts/hooks/check-grill-skill.sh` 门禁——grilling 缺席/指纹不符 = 硬红，先跑 install-grill-skill.sh（来源写死 mattpocock/skills 钉死 commit）再开工；拷问按 grilling 方法论执行（决策树分轮、frontier 问空才结束、每问附推荐答案）；事实核实统一派调研者（带出处），主控汇总裁决，决定项目所有者做。
```

### Edit B（§四[0 对齐]——分流 + 逐字转发 + 子集合并 + 双重矛盾检查）

old_string：

```
**[0 对齐]** 按§二第 3 句拷问；提问按依赖分层成决策树：同层前置已明确的攒批问（≤3 问）；跨层必须等本轮答案更新后再问；前置未决的留到该层解锁，禁提前问；非真选择题（有明确推荐且低风险）授权档内自答，只拦不可代决类。
```

new_string：

```
**[0 对齐]** 先分流：验收标准说得清、清单列得出 → 主控直接写需求登记账本，不派调研者；说不清 → 整单转调研者对齐特例（条文在《智能体角色定义.md》调研者节——不直连项目所有者，问答一律经主控**逐字转发**：转问题不概括、转回答不改写）。调研者按 grilling 方法论拷问（开工前 check-grill-skill.sh 门禁，参考式拷问三类走法见角色定义），交互 ≤3 轮，产出**一个**五行登记子集文件（.aiops/docs/需求登记子集.md），自检矛盾（前后冲突必须问清，问清前不交）后交主控；主控把子集各节抄进 PROGRESS 需求登记节 + **复检矛盾** + 删除子集文件（入库留证后随下一 commit 删，见预算门禁 D 判据）——三步一个动作；双重检查都过，对齐阶段才算完成，之后才进 playbook/planner。3 轮未收敛 → 主控直接拍终态描述交项目所有者确认或转原型通道。
```

### Edit C（需求五行登记制⑤栏——先占位后回填，需求7）

old_string：

```
④项目所有者确认——原话或转述确认，未确认不进 PLAYBOOK；⑤交付回链——commit 与 verdict。
```

new_string：

```
④项目所有者确认——原话或转述确认，未确认不进 PLAYBOOK；⑤交付回链——对齐阶段一律留占位 `待交付回填 | 关联批次=<批号 | 未定>`；对应功能/批次整批 PASS 并 commit 时才回填（commit 号 + 台账节路径），不许提前填（填了就是编造）；终验时关联批次已 PASS 而⑤仍待回填 = 终验 FAIL（终验清单 J 项）。
```

### Edit D（资产修订终态化——净减尺子例外句，拍板8）

old_string：

```
**资产修订终态化**：修订机制文档/模板/提示词类资产 → 产出改后全文式终态条文，被替代的旧叮嘱删除；每次修订满足净减尺子——新增规则数 ≤ 删除规则数，超了打回重新收敛；checker 验收时加残留检查：旧条款不在盘中。三权威文档的补丁一律写成终态条款，不留"禁止上版行为"式否定链。
```

new_string：

```
**资产修订终态化**：修订机制文档/模板/提示词类资产 → 产出改后全文式终态条文，被替代的旧叮嘱删除；每次修订满足净减尺子——新增规则数 ≤ 删除规则数，超了打回重新收敛；checker 验收时加残留检查：旧条款不在盘中。三权威文档的补丁一律写成终态条款，不留"禁止上版行为"式否定链。**例外（拍板8）**：机制扩展类修订（新增角色模式/门禁/台账等结构性新增）允许净增，前置条件 = 本次修订逐条给出删旧抵消清单并落 ADR 记账（"删旧抵消 + 记账"制）；例外不得连续两次——下一次修订必须净减，把欠账还上。
```

批次3 验证：

```sh
grep -c '需求对齐分流路由' 主控卡.md                 # 期望：1
grep -c '逐字转发' 主控卡.md                          # 期望：≥1（§四[0]）
grep -c '待交付回填' 主控卡.md                        # 期望：1
grep -c '删旧抵消 + 记账' 主控卡.md                   # 期望：1
sh 项目模板/.aiops/scripts/hooks/check-anchor.sh 主控卡.md '需求对齐分流路由'   # 期望：输出 1
```

---

## 批次4：智能体角色定义.md 三处 Edit（需求2/3/4/5）

### Edit E（调研者节——加"对齐特例"小节，含逐字转发/参考式拷问/产出纪律；汇报纪律行不改——无直连例外）

old_string：

```
- 输出与方法：Markdown 报告落盘到主控指定路径，文件名 research_<主题>_<日期>.md，结构含结论摘要/
  详细发现（带出处）/未查到项/来源清单；先搜再答，事实与推理分开，来源冲突并列呈现，查不到写“未查到”。

主控采信调研报告前抽验至少 1 条出处（点开链接/打开文件，核对存在且内容对得上），抽验结果记 PROGRESS；抽验不过 → 整份报告降为线索。
```

new_string：

```
- 输出与方法：Markdown 报告落盘到主控指定路径，文件名 research_<主题>_<日期>.md，结构含结论摘要/
  详细发现（带出处）/未查到项/来源清单；先搜再答，事实与推理分开，来源冲突并列呈现，查不到写“未查到”。

### 对齐特例（需求对齐期专用；通信仍经主控逐字转发，不直连项目所有者）

- 触发：仅主控按主控卡§四[0] 分流转来"说不清的需求"时启用；主控任务单 = 需求原话 + 已知背景 +
  本项目宿主可用的技能加载方式。本模式只存在于**需求对齐阶段**，进入执行期即回归上方红线（不改文件）。
- 通信（拍板2）：问答一律 调研者 → 主控 → 项目所有者 → 主控 → 调研者 逐字转发；主控只传话，
  不改写问题与回答。**本模式不开子代理直连口子**——"唯一发言人"与"子代理不直接对项目所有者说话"
  两条铁律不因本模式失效。
- 拷问方法：开工前主控跑 check-grill-skill.sh 门禁（grilling 缺席/指纹不符 = 硬红）；按 grilling
  方法论执行（决策树分轮、frontier 问空才结束、每问附推荐答案）；交互 ≤3 轮，未收敛 → 交还主控
  （主控直接拍终态描述交项目所有者确认，或转原型通道）。
- 参考式拷问（总原则：让项目所有者做判断题，不出开放题——提供信息让人回复，远比让人凭空生成
  信息容易）：三类用户三路走——
  ① 有线索（在某处/某网站见过类似东西）：按线索搜成熟模板/同类实现，把网址/模板名直接摆出来问
     "是不是像这个"；② 连线索都没有（需求太简陋）：先问粗粒度方向，再去搜参考网址给项目所有者
     比对，可索取截图等素材；③ bug/说得清的需求：不启用本模式，退回主控直接登记执行。
  对项目所有者的提问一律经主控转，白话协议由主控执行（主控卡第七节）。
- 产出纪律：一次需求对齐**只许产出一个文件** `.aiops/docs/需求登记子集.md`——本次处理的若干条需求
  装进同一文件多个节（每节五行，字段同需求登记账本，①栏项目所有者原话逐字粘贴）；禁止一次需求
  产多个文件、禁止一条需求一个文件。定稿前自检矛盾：逐节比对，前后不一致/有冲突的必须问清项目
  所有者（经主控）再定稿；没矛盾才交主控。主控合并（抄节入 PROGRESS + 复检矛盾 + 删除子集文件）
  完成后，子集文件不得在 HEAD 长驻（预算门禁 D 判据机械拦）。

主控采信调研报告前抽验至少 1 条出处（点开链接/打开文件，核对存在且内容对得上），抽验结果记 PROGRESS；抽验不过 → 整份报告降为线索。
```

### Edit F（checker verdict 落盘——台账制，需求5）

old_string：

```
- verdict 落盘：`audits/check-<批次号>-<日期>.md`，只追加；同时在 PROGRESS checker 结论区登记一行，两要素：`B<n> | verdict 文件路径`（PASS/FAIL 与证据由 verdict 文件承载，登记行不复写）。FAIL 项命中错误模式清单既有模式串 = 复发，verdict 记 `复发|模式串|批号`。写 verdict 用批量格式，一次说清，不写重复汇总。
```

new_string：

```
- verdict 落盘（审计台账制，一份台账记完一个大需求）：`.aiops/docs/audits/ledger-<大需求名>.md`，
  每批在台账内**追加一节**（标题行 `## B<n> <日期>`，节内结论+证据+行号），只追加、不改写旧节、
  不另开文件；中小需求共用 `.aiops/docs/audits/ledger-日常.md`。同时在 PROGRESS checker 结论区
  登记一行，两要素：`B<n> | verdict 台账路径`（PASS/FAIL 与证据由台账节承载，登记行不复写）。
  FAIL 项命中错误模式清单既有模式串 = 复发，当批台账节记 `复发|模式串|批号`。写台账节用批量格式，
  一次说清，不写重复汇总。
```

### Edit G（checker 终验额外职责——台账口径 + ⑤回填判据 + research 清零，需求5/7）

old_string：

```
- 终验额外职责：逐行机械校验 PROGRESS 结论区——每行的 verdict 文件存在、且文件内结论行的批号与登记行一致（不靠通读）；对不上 = 终验 FAIL。`git log -p -- <audits 目录>` 与 `git log -p -- PROGRESS` 保留检查（防事后改写）。
```

new_string：

```
- 终验额外职责：逐行机械校验 PROGRESS 结论区——每行的台账文件存在、且台账内含该批号标题节（`## B<n>`）
  与结论一致（不靠通读）；对不上 = 终验 FAIL。⑤栏关联批次已 PASS 而仍写"待交付回填"= FAIL（回填门禁，
  需求7）。research/ 目录终验时须清零（归档或删除，需求5）。`git log -p -- <audits 目录>` 与
  `git log -p -- PROGRESS` 保留检查（防事后改写——台账只追加不改写旧节）。
```

批次4 验证：

```sh
grep -c '对齐特例' 智能体角色定义.md           # 期望：1（唯一标题；汇报纪律行未改 = 无第二处）
grep -c '逐字转发' 智能体角色定义.md           # 期望：≥1
grep -c '参考式拷问' 智能体角色定义.md         # 期望：1
grep -c 'ledger-' 智能体角色定义.md            # 期望：≥2
grep -c '待交付回填' 智能体角色定义.md         # 期望：1（终验职责）
sh 项目模板/.aiops/scripts/hooks/check-anchor.sh 智能体角色定义.md '### 对齐特例（需求对齐期专用'   # 期望：输出 1
# 直连例外不存在（拍板2：不允许"调研者可直接对项目所有者说话"字样出现）
grep -n '直接对项目所有者说话' 智能体角色定义.md   # 期望：仅"不直接对项目所有者说话"（红线句）与"子代理不直接对项目所有者"；无"调研者可直接…"
```

---

## 批次5：模板与 README（PROGRESS / 审计报告 / PLAYBOOK / 读集 / 模板说明 / AGENTS 模板 / README）

### 5.1 `项目模板/.aiops/docs/PROGRESS.md.template` 三处 Edit

**Edit 1（需求登记⑤栏占位格式，需求7）：** old_string：

```
- **交付回链**：<实现它的 commit 与 verdict>
```

new_string：

```
- **交付回链**：<对齐阶段占位 `待交付回填 | 关联批次=<批号 | 未定>`；对应功能/批次整批 PASS 并 commit 时才回填（commit 号 + 台账节路径）。终验判据：关联批次已 PASS 而⑤仍待回填 = FAIL>
```

**Edit 2（checker 结论区示例行——台账路径，需求5）：** old_string：

```
- B3 | 2026-08-22 | PASS | 证据：src/x.kt:12-40（示例行，登记时删除） | .aiops/docs/audits/check-B3-0822.md
- B2 | 2026-08-21 | FAIL | 机械检查红——M-密钥 1 命中（证据：src/y.kt:8）（示例行，登记时删除） | .aiops/docs/audits/check-B2-0821.md>
```

new_string：

```
- B3 | 2026-08-22 | PASS | 证据：src/x.kt:12-40（示例行，登记时删除） | .aiops/docs/audits/ledger-<大需求名>.md
- B2 | 2026-08-21 | FAIL | 机械检查红——M-密钥 1 命中（证据：src/y.kt:8）（示例行，登记时删除） | .aiops/docs/audits/ledger-日常.md
```

**Edit 3（行数硬红线注明——120 黄牌已有，补 200 硬红指针）：** old_string：

```
   （只留最近 2~3 项详情），再写新内容——压缩是收尾的固定动作，不是可选项；
   快检有兜底黄牌：`wc -l .aiops/docs/PROGRESS.md` 超过 <120> 行 = 黄牌，提示该压了
```

new_string：

```
   （只留最近 2~3 项详情），再写新内容——压缩是收尾的固定动作，不是可选项；
   快检有兜底黄牌：`wc -l .aiops/docs/PROGRESS.md` 超过 <120> 行 = 黄牌，提示该压了；
   pre-commit 有硬红线：>200 行 = 拦下（文件预算门禁 G 判据），压缩是唯一出路
```

### 5.2 `项目模板/.aiops/docs/archive/归档件模板/审计报告模板.md.template` 一处 Edit

old_string：

```
> **checker verdict 写法**：用作 verdict 时，判定**一次说清**——每条 rubric 一段
> "证据 + 结论"即可；**不写末尾汇总表、不写重复的夸奖/建议段**（同一内容说三遍
> 信息零增益，约多付 40% 行数）；记录用行式 `K: V`，不用表格（AI 读的文档用行式）。
> **批量验收 verdict 变体**：主控整批转交时（一批 ≤3 步），出**一份** verdict 代替
> 每步一份——文件名 `check-<批次号>-<日期>.md`，**每步一个子节**；verdict 头部复述转交单原文
> （路径\|事实\|期望vs实际，≤5 行）——转述可审计。格式：
```

new_string：

```
> **checker verdict 写法（审计台账制）**：每个大需求一份台账 `.aiops/docs/audits/ledger-<大需求名>.md`，
> 中小需求共用 `ledger-日常.md`；每批在台账内**追加一节**（标题 `## B<n> <日期>`，节内含结论+证据），
> 不另开文件、不改写旧节。判定**一次说清**——每条 rubric 一段"证据 + 结论"即可；
> **不写末尾汇总表、不写重复的夸奖/建议段**（同一内容说三遍信息零增益，约多付 40% 行数）；
> 记录用行式 `K: V`，不用表格（AI 读的文档用行式）。
> **批量验收节内格式**：一批 ≤3 步时当批一节、每步一个子小节；节头部复述转交单原文
> （路径\|事实\|期望vs实际，≤5 行）——转述可审计。格式：
```

**（锚点勘误说明）**：初稿锚点写的是 `> **批量验收 verdict 变体**…` 行内碎片，与盘中
`**批量验收 verdict 变体**…（无行首 > 前缀，因为它在引用块中间行）` 不完全同形；上面已改为
第 5~10 行整块锚，按整块精确匹配。

### 5.3 `项目模板/.aiops/docs/archive/归档件模板/PLAYBOOK.md.template` 三处 Edit

**Edit 1** old_string：

```
2. **执行与审查：** 每批改动后，由与 worker 不同源的 checker **独立重跑**附录 M 的
   checker 验收项，原始输出存进 checker 自己的 verdict 文件（.aiops/docs/audits/check-*.md）——
```

new_string：

```
2. **执行与审查：** 每批改动后，由与 worker 不同源的 checker **独立重跑**附录 M 的
   checker 验收项，原始输出存进 verdict 台账（.aiops/docs/audits/ledger-<大需求名>.md 当批节）——
```

**Edit 2** old_string：

```
6. **复核**：checker 独立重跑本批 checker 验收项（附录 M 对应项全量）+ 按判定标准判读，
   出**一份批量 verdict**（每步一个子节：结论+证据+行号），落 `.aiops/docs/audits/check-<批次>-<日期>.md`。
```

new_string：

```
6. **复核**：checker 独立重跑本批 checker 验收项（附录 M 对应项全量）+ 按判定标准判读，
   在 verdict 台账（`.aiops/docs/audits/ledger-<大需求名>.md`）**追加当批一节**
   （标题 `## B<N> <日期>`，每步一个子小节：结论+证据+行号）。
```

**Edit 3** old_string：

```
- checker 的 verdict（.aiops/docs/audits/check-*.md）是验收唯一依据；项目所有者可让任何新会话重跑
```

new_string：

```
- checker 的 verdict 台账（.aiops/docs/audits/ledger-*.md）是验收唯一依据；项目所有者可让任何新会话重跑
```

### 5.4 `项目模板/.aiops/读集.md.template` 两处 Edit

**Edit 1（按需取用表加一行）** old_string：

```
| 错误模式清单 / 登记教训 | `项目模板/.aiops/docs/错误模式清单.md.template` | — |
```

new_string：

```
| 错误模式清单 / 登记教训 | `项目模板/.aiops/docs/错误模式清单.md.template` | — |
| 需求对齐拷问（grilling） | .aiops/skills/grilling（来源写死：install-grill-skill.sh 下载 mattpocock/skills 钉死 commit） | — |
```

**Edit 2（触发清单加一行）** old_string：

```
- .aiops/docs/research/ 调研报告——触发：采信前抽验出处
```

new_string：

```
- .aiops/docs/research/ 调研报告——触发：采信前抽验出处；执行期在手 ≤3，终验清零
- .aiops/skills/ grilling 技能——触发：需求对齐拷问前，check-grill-skill.sh 绿才开工
```

### 5.5 `项目模板/说明-如何使用本项目模板.md` 三处 Edit

**Edit 1（硬编码宿主目录去特异性——拍板1，旧稿漏掉此处）：** old_string：

```
3. 大需求开工时，主控读 `../智能体角色定义.md` 为 planner/worker/checker 各生成一份专属
   投影 prompt（`.qoder/agents/`）——子代理不直接读角色定义
```

new_string：

```
3. 大需求开工时，主控读 `../智能体角色定义.md` 为 planner/worker/checker 各生成一份专属
   投影 prompt（放当前宿主约定的代理目录，位置见宿主映射表）——子代理不直接读角色定义
```

**Edit 2（清单表与命名约定更新——"三钩子"与 verdict 命名旧口径）：** old_string：

```
| `scripts/hooks/`（放项目根） | 机械门禁三钩子（激活见 AGENTS 模板提交纪律节） |
```

new_string：

```
| `scripts/hooks/`（放项目根） | 机械门禁（pre-commit + commit-msg 两钩子；另附锚点/批限/字节/技能四手动检查 + 安装/预算两辅助脚本——预算内置 pre-commit，激活见 AGENTS 模板提交纪律节） |
```

**Edit 3** old_string：

```
- checker 的 verdict 命名：`.aiops/docs/audits/check-<步骤或阶段>-<日期>.md`，只追加
```

new_string：

```
- checker 的 verdict 走审计台账：`.aiops/docs/audits/ledger-<大需求名>.md`（中小需求共用 ledger-日常.md），
  每批追加一节（`## B<n> <日期>`），只追加不改写旧节
- 新项目初始化后先跑一次 `sh .aiops/scripts/hooks/install-grill-skill.sh`（联网下载拷问技能，
  来源钉死 mattpocock/skills）；之后每次需求对齐拷问前跑 `check-grill-skill.sh` 门禁，红 = 禁止开工拷问
```

### 5.6 `项目模板/.aiops/AGENTS.md.template` 两处 Edit

**Edit 1（硬编码宿主目录去特异性——拍板1）：** old_string：

```
- **子代理**：读自己的投影 prompt（`.qoder/agents/`，由主控从
  `<方法论路径>/项目经验/智能体角色定义.md` 投影生成）——**不直接读角色定义**。
```

new_string：

```
- **子代理**：读自己的投影 prompt（放当前宿主约定的代理目录，由主控从
  `<方法论路径>/项目经验/智能体角色定义.md` 投影生成）——**不直接读角色定义**。
```

**Edit 2（钩子计数与 verdict 口径同步——"三钩子"已是两钩子 + 预算内置）：** old_string：

```
20. **克隆后一次性执行 `git config core.hooksPath .aiops/scripts/hooks` 激活机械门禁三钩子**；
    钩子红 = 修问题，禁 `--no-verify`（三钩子职责与能力边界见 `.aiops/scripts/hooks/README.md`）
```

new_string：

```
20. **克隆后一次性执行 `git config core.hooksPath .aiops/scripts/hooks` 激活机械门禁**；
    钩子红 = 修问题，禁 `--no-verify`（钩子与手动检查脚本的职责与能力边界见
    `.aiops/scripts/hooks/README.md`；新项目另先跑一次 install-grill-skill.sh 下载拷问技能）
```

### 5.7 `README.md` 三处 Edit

**Edit 1（Quick Start 加一步——需求1 落地入口）** old_string：

```
# 3. 激活机械门禁
cd ~/my-project && git config core.hooksPath .aiops/scripts/hooks
```

new_string：

```
# 3. 激活机械门禁 + 安装拷问技能（来源写死：mattpocock/skills，联网）
cd ~/my-project && git config core.hooksPath .aiops/scripts/hooks
sh .aiops/scripts/hooks/install-grill-skill.sh
```

**Edit 2（架构图门禁行——台账口径 + 手动检查 ×4）** old_string：

```
 机械门禁（git hooks，可选但强烈建议）：
   pre-commit  = PROGRESS 验收结论行必配真实 verdict
   commit-msg  = 进度文件净删行必须带压缩标记
   手动检查 ×3 = 锚点唯一性 / 会话批次数上限 / 常读文档字节上限
```

new_string：

```
 机械门禁（git hooks，可选但强烈建议）：
   pre-commit  = PROGRESS 验收结论行必配真实台账节 + 文件预算（直属数/白名单/临时件/台账前缀/行数）
   commit-msg  = 进度文件净删行必须带压缩标记
   手动检查 ×4 = 锚点唯一性 / 会话批次数上限 / 常读文档字节上限 / 拷问技能在位
```

**Edit 3（术语表加三行）** old_string：

```
| PLAYBOOK / PROGRESS | 大需求总控手册 / 项目唯一进度现场文件 |
```

new_string：

```
| PLAYBOOK / PROGRESS | 大需求总控手册 / 项目唯一进度现场文件 |
| grill-me / grilling | 从 mattpocock/skills 下载的拷问技能 / 其方法论本体（决策树分轮追问） |
| 审计台账（ledger） | 每个大需求一份的验收结论文件，每批追加一节，代替每批一个 verdict 文件 |
| 需求登记子集 | 调研者对齐特例的唯一产出文件，主控合并进 PROGRESS 后即删、不长期驻留 HEAD |
```

批次5 验证：

```sh
grep -c 'install-grill-skill' 项目模板/说明-如何使用本项目模板.md README.md   # 期望：各 ≥1
grep -c 'grilling' 项目模板/.aiops/读集.md.template                  # 期望：≥1
grep -c 'grill-skill' 项目模板/.aiops/AGENTS.md.template             # 期望：≥1（5.6 Edit2 是 install-grill-skill.sh，不含 "grilling" 字样）
grep -rn '三钩子' 项目模板/ README.md 主控卡.md 智能体角色定义.md | grep -v 实施指导书        # 期望：0 命中
grep -rn '\.qoder/' 项目模板/ | grep -v 实施指导书 | grep -v 宿主映射表      # 期望：0 命中（宿主映射表的 Qoder 列 = 映射载体本身，保留，见禁改清单）
```

---

## 批次6：一致性终验 + 净减记账 + commit

### 6.1 终验清单（真仓库内逐条跑，全绿才提交；每条的"期望"就是判据，不靠自证）

```sh
cd <本仓库根>
# 1. 旧 verdict 文件口径清零（权威文档与模板不得再教人产 check-<批次> 文件）
grep -rn 'check-<批次\|check-<步骤或阶段\|check-B[0-9]' 主控卡.md 智能体角色定义.md README.md 项目模板/ | grep -v archive | grep -v '实施指导书\|需求书' || true
#    期望：无输出（脚本头注释/历史归档/沙箱产物不算）
# 2. 台账口径三处齐（角色定义 + PROGRESS 模板 + PLAYBOOK 模板 + 审计报告模板）
grep -l 'ledger' 智能体角色定义.md 项目模板/.aiops/docs/PROGRESS.md.template 项目模板/.aiops/docs/archive/归档件模板/PLAYBOOK.md.template 项目模板/.aiops/docs/archive/归档件模板/审计报告模板.md.template
#    期望：四个文件全部列出
# 3. 技能引用闭环：所有 check-grill-skill.sh / install-grill-skill.sh 引用都有对应实体脚本
ls 项目模板/.aiops/scripts/hooks/ | grep -E 'grill'          # 期望：check-grill-skill.sh install-grill-skill.sh
grep -rln 'grill-skill' 主控卡.md 智能体角色定义.md 项目模板/ | wc -l   # 期望：≥8（主控卡/角色定义/两脚本/README 钩子/读集/说明/AGENTS；README.md 根文件不在本集内不计）
# 4. 子集文件口径闭环：条文、判据、钩子三处路径一致（钩子本体不含该字样——判据宿主是 budget 脚本，
#    pre-commit 的 B 部分内置执行它；pre-commit 本体只含调用，见批次2 验证 #2）
grep -c '需求登记子集' 主控卡.md 智能体角色定义.md 项目模板/.aiops/scripts/hooks/check-files-budget.sh
#    期望：三文件各 ≥1
# 5. 硬编码宿主目录清零（拍板1；主控卡投影节的"本仓库宿主 = Qoder → .qoder/agents/，本仓库自身不迁移"
#    登记句与宿主映射表模板的 Qoder 列 = 映射载体本身（禁改清单锁定），不是方法论硬编码，排除不计）
grep -rn '\.qoder/' 主控卡.md 智能体角色定义.md README.md 项目模板/ | grep -v '实施指导书\|需求书' | grep -v '宿主映射表\|本仓库宿主 = Qoder' || true   # 期望：无输出
# 6. 直连例外不存在（拍板2：只许"经主控逐字转发"字样，不许"可直接对话/直接交互"例外句；
#    注意：grep 自带的注释行含模式串——用 -v 排除注释行后再判）
grep -n '直接与项目所有者\|直接交互\|可直接' 智能体角色定义.md 主控卡.md | grep -v '^[0-9]*: *#\|# 期望' || true   # 期望：无输出
# 7. 旧稿假红回归（三段 bug 都要有对应修复痕迹，防止回退）
grep -c 'quotepath=false' 项目模板/.aiops/scripts/hooks/*.sh        # 期望：pre-commit 与 check-files-budget 各 ≥1
grep -c 'maxdepth 1' 项目模板/.aiops/scripts/hooks/check-files-budget.sh   # 期望：≥1
grep -cF '.aiops/docs/audits/[^ |]*' 项目模板/.aiops/scripts/hooks/pre-commit   # 期望：1（sed 路径提取修复痕迹——旧 grep -o 截断式已不在）
# 8. 净减尺子记账（人工核对 6.2 表逐条成立后，照抄进 commit message）
# 9. 字节尺子：本仓库若配了基线 tag 则跑，未配则登记跳过
sh 项目模板/.aiops/scripts/hooks/check-lean.sh 2>/dev/null || echo "本仓库未配基线 tag，登记跳过（不改本仓库基线）"
# 10. 预算全量盘（HEAD 口径终验）
sh 项目模板/.aiops/scripts/hooks/check-files-budget.sh mode=all
#    期望：仅 C 判据红属预期（根目录权威/依据文档 = 本仓库自身治理件；白名单机制服务新项目，不含本仓库
#    存量）——按存量兼容口径登记豁免后继续；A/B/D/E/F/G 必须绿。除 C 外还有红 = 修，禁止带红前进
```

### 6.2 净减尺子记账（拍板8：删旧抵消 + 记账；逐条核对后照抄）

| 已删/并入的旧条文 | 位置 | 抵消量 |
|---|---|---|
| 主控卡§四[0] 内含拷问方法论转述（决策树分层/攒批问≤3/跨层等答案/前置未决留解锁/授权档内自答——方法论整段并入"按 grilling 方法论执行"引用） | 主控卡 Edit B | 5 条 |
| 主控卡§二第3句 内含"grill-me 式拷问"一句话纪律（并入分流路由 + 技能门禁） | 主控卡 Edit A | 1 条 |
| verdict 每批一文件制：文件名规则 `check-<批次号>-<日期>.md` 整条废除（角色定义/审计报告模板/PLAYBOOK 模板×2/PROGRESS 示例/说明模板命名约定） | 批次2+4+5 | 6 处 |
| 读集/AGENTS 模板等处的宿主硬编码路径 `.qoder/agents/`（不属规则，属去特异性修正，记账备注） | 5.5/5.6 | — |

新增条文计数（执行时数实际条数填入）：约 +19 条（分流路由与技能门禁 3、逐字转发通信 2、
对齐特例触发/产出纪律 4、参考式拷问三类 3、台账制口径 4、回填占位与终验判据 2、预算判据 1 行式）。
**净增如实记账，不豁免不隐瞒**；按拍板8 例外条款，本次净增须落 ADR 记账（见 6.3 提交动作），
并承诺下一次修订净减。

### 6.3 落 ADR 记账（机制扩展例外必做，拍板8）+ commit

```sh
cd <本仓库根>
# 先落 ADR（净增记账——例外条款前置条件；真仓库没有 .aiops/ 骨架，先建目录）
mkdir -p .aiops/docs/decisions
cp 项目模板/.aiops/docs/decisions/ADR-模板.md.template .aiops/docs/decisions/ADR-017-researcher机制与文件治理.md
# （本仓库若 decisions/ 无 ADR-017 编号则顺延；ADR 内容：本次 8 项拍板 + 净增记账表 + 回填门禁说明）
# 一次整批提交
git add 主控卡.md 智能体角色定义.md README.md \
  项目模板/.aiops/scripts/hooks/install-grill-skill.sh \
  项目模板/.aiops/scripts/hooks/check-grill-skill.sh \
  项目模板/.aiops/scripts/hooks/check-files-budget.sh \
  项目模板/.aiops/scripts/hooks/pre-commit \
  项目模板/.aiops/scripts/hooks/README.md \
  项目模板/.aiops/docs/PROGRESS.md.template \
  项目模板/.aiops/docs/archive/归档件模板/审计报告模板.md.template \
  项目模板/.aiops/docs/archive/归档件模板/PLAYBOOK.md.template \
  项目模板/.aiops/读集.md.template \
  项目模板/说明-如何使用本项目模板.md \
  项目模板/.aiops/AGENTS.md.template \
  需求书-researcher机制与文件治理.md \
  实施指导书-researcher机制与文件治理.md \
  .aiops/docs/decisions/
sh 项目模板/.aiops/scripts/hooks/check-files-budget.sh mode=all   # 期望：仅 C 存量红 → 豁免登记后继续（与 6.1 #10 同口径）；其余判据绿才提交
git commit -m "$(cat <<'EOF'
feat(governance): researcher机制改造+文件治理（8项拍板全落地，需求书驱动）

- 分流路由+调研者对齐特例：问答经主控逐字转发（无直连），参考式拷问≤3轮，一次一子集文件、入库留证后随下一commit删除
- grill-me 独立技能：来源写死 mattpocock/skills 钉死 commit 3cca18b3…，双指纹核对（grilling 缺失=硬红禁止拷问）；MIT 署名保留
- verdict 改审计台账制 ledger-*.md（每批追加一节），pre-commit 路径提取改 sed（修复中文台账名截断）
- 文件预算门禁并入 pre-commit：直属≤10/归档≤12/根目录白名单/子集删除/台账前缀/PROGRESS>200 行硬红；全部 -c core.quotepath=false（修复中文文件名漏检）；research 在手≤3 终验清零
- ⑤交付回链先占位后回填 + 终验机械判据（关联批次 PASS 仍待回填=FAIL）
- 宿主目录去硬编码（拍板1）；净减尺子落"删旧抵消+记账"例外句（拍板8），净增记账见 ADR-017
- 根目录新增依据/指导文档 2 份（C 判据白名单外存量，豁免登记见 ADR-017）
[净增记账] 删旧抵消 12 处/新增约 19 条——机制扩展例外（拍板8），ADR-017 记账，下次修订净减
EOF
)"
git status --porcelain   # 期望：干净（需求书+实施指导书+ADR-017 已一并入库留痕）
```

---

## 7. 总验收清单（对照需求书逐条打勾）

| # | 需求书条目 | 验收命令/判据 |
|---|---|---|
| 1 | grill-me 独立 skill、写死网上下载 | 沙箱实测：install 下载两技能 + 指纹自检绿；grilling 缺失/篡改 = 退出 1（硬红）；主控卡只有技能引用，无内含方法论转述 |
| 2 | researcher 接管对齐、分流、双重矛盾检查 | 主控卡§四[0] 含分流/子集/复检/合并删；角色定义含"对齐特例"节且只走逐字转发；分流留痕行在 PROGRESS 模板需求登记节 |
| 3 | 参考式拷问三类用户 | 角色定义"参考式拷问"①②③三路齐全 + ≤3 轮 + 超轮交还主控 |
| 4 | 一次一子集文件、合并后删 | 角色定义产出纪律 + pre-commit D 判据沙箱红测（入库放行/空提交拦截/删除放行三态）通过 |
| 5 | 文件爆炸治理 | 台账制全文落地（角色定义/三模板/PROGRESS/pre-commit/说明）；预算七判据（A-G）沙箱红绿测通过（含 A 项 maxdepth 修正回放：历史 134 → ~26）；旧 check-<批次> 口径 grep 清零 |
| 6 | 文件归一处 | pre-commit 根目录白名单红测通过（中文名"散落文件.md"被拦——quotepath 回归通过） |
| 7 | 交付回链时序 | 主控卡五行登记⑤栏 + PROGRESS 模板字段行 = 占位后回填；终验判据 J 项在角色定义终验职责 |
| 全局 | 机械性 | 需求1/4/5/6/7 判据全部钩子级或脚本级，无一条靠"主控自觉" |
| 全局 | 通用性 | `.qoder/` 硬编码清零，落盘位置中性描述 + 宿主映射 |
| 全局 | 中文路径兼容 | 所有 git 判据带 `-c core.quotepath=false`（沙箱中文名红测通过） |
| 全局 | 证据不销毁 | 临时件先入库留证再删（拍板6），budget D 判据沙箱测过"入库放行/未删拦截/删除放行"三态 |
| 全局 | 存量兼容 | audits/ 存量 check-* 文件豁免（预算 E 判据只管新增）；老项目首次触红归档一次 |

## 8. 禁改清单与回退

禁改：`放权机制.md`、`docs/EVIDENCE.md`、`LICENSE`、`.gitignore`、
`项目模板/scripts/init-project.sh`（hooks 整目录拷贝自动带上新脚本，无需改）、
`项目模板/.aiops/agents/宿主映射表.md.template`（调研者行已存在）。

回退：本批是单 commit——任何验证失败且修不动时 `git reset --soft HEAD~1` 全量退回，
禁止在坏状态上叠改。沙箱目录 /tmp/gk-sandbox 用完即弃，与真仓库无关。

已知边界（如实登记，不隐瞒）：
- install 脚本三通道中 api.github.com 主通道已实测逐字可达（钉死 commit 3cca18b3… 下两文件
  hash-object 指纹与本地副本一致）；raw/jsdelivr 备通道在本机网络不可达，保留给其他网络环境；
  无 curl 环境靠 AI 网页抓取逐字落盘后由指纹自检兜底。
- check-grill-skill.sh 的指纹只防"内容被改"，不防"整份换皮"（换皮 = 指纹不同 = 红，天然拦截）。
- 预算判据 E（audits 只许 ledger-*）对**存量** check-* 文件豁免（只查新增）；历史项目按
  存量兼容口径首次触红归档一次，不倒查。
- 需求书原口径"research 活跃数 0"在执行期不可行（报告交付后还要被读），已改为"在手 ≤3 +
  终验清零"并回写需求书预算表；终验清零判据在角色定义终验职责与批次6 终验清单。
