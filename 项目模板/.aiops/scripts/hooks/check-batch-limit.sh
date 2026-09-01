#!/bin/sh
# 钩子3：本会话批次计数超限拒绝派活（主控每次派活前跑，30s）
# 拦截：.aiops/docs/PROGRESS.md 运行计数节条目 ≥5 仍继续派活
# 背景：防单会话超批派活
# 判据：第 5 批完成后即拒绝第 6 批派活（第 5 批完成即收尾换会话）。

set -u

[ -f .aiops/docs/PROGRESS.md ] || {
    echo "[check-batch-limit] 拦下：当前目录找不到 .aiops/docs/PROGRESS.md（请在项目根运行）。" >&2
    exit 1
}

count=$(sed -n '/^## 运行计数/,/^## /p' .aiops/docs/PROGRESS.md | tr -d '\r' | grep -c '^-')

if [ "$count" -ge 5 ]; then
    echo "[check-batch-limit] 拦下：本会话批次已达 5，先收尾换会话（运行计数 $count 条）。" >&2
    exit 1
fi

exit 0
