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
# 兼容两种传参：mode=diff / mode=all（指导书调用约定）与裸 diff / all——
# 若按字面比对，"mode=diff" != "diff" 会走错分支（实测红：pre-commit 内置调用时 D 判据恒红）
case "$mode" in mode=*) mode=${mode#mode=} ;; esac
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
