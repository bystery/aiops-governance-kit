#!/bin/sh
# 锚点机械核对（主控 §四[3] 格式审第⑦项配套工具，派发时人工跑，30s）
# 用法：check-anchor.sh <文件> <锚点串>
# 输出：命中次数；退出码 0 = 恰好 1 次（唯一锚点可用），2 = 命中 ≠1
# Windows CRLF 文件先 tr -d '\r' 再匹配。
# 背景：任务单锚点在目标文件中不唯一/不存在时，Edit 会空跑或错位

set -u

[ $# -eq 2 ] || {
    echo "[check-anchor] 用法：check-anchor.sh <文件> <锚点串>" >&2
    exit 2
}

[ -f "$1" ] || {
    echo "[check-anchor] 拦下：文件不存在：$1" >&2
    exit 2
}

count=$(tr -d '\r' < "$1" | grep -c -F -- "$2")

echo "$count"

if [ "$count" -eq 1 ]; then
    exit 0
else
    exit 2
fi
