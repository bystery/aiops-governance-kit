#!/bin/sh
# 批限检查（手动检查，非钩子）：本会话批次计数超限拒绝派活（主控每次派活前跑，30s）
# 拦截：.aiops/docs/PROGRESS.md 运行计数节批次行 ≥5 仍继续派活
# 背景：防单会话超批派活
# 判据：只数批次行（`- B<n>` 开头，后接批次字段行）；投影/微调/并行开闸/零产出轮等记账行
#       与批次同节记录但不以 B<n> 开头，不参与计数——防记账行挤占批次数造成假红。
#       第 5 批完成后即拒绝第 6 批派活（第 5 批完成即收尾换会话）。

set -u

[ -f .aiops/docs/PROGRESS.md ] || {
    echo "[check-batch-limit] 拦下：当前目录找不到 .aiops/docs/PROGRESS.md（请在项目根运行）。" >&2
    exit 1
}

count=$(sed -n '/^## 运行计数/,/^## /p' .aiops/docs/PROGRESS.md | tr -d '\r' | grep -cE '^- ?B[0-9]+[[:space:]]*[|]')

if [ "$count" -ge 5 ]; then
    echo "[check-batch-limit] 拦下：本会话批次已达 5，先收尾换会话（运行计数 $count 条）。" >&2
    exit 1
fi

exit 0
