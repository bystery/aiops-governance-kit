#!/bin/sh
# 字节尺子：三常读文档合计字节闸 + 基线 tag 恒等比对（主控手动跑，不挂钩子）
# 用法：check-lean.sh <基线tag> <硬顶字节> <文件...>
#   绿（退出 0）= 合计 ≤ 硬顶，且（基线 tag 存在时）合计 ≤ 该 tag 下逐文件合计
#   tag 不存在 = 警告"基线 tag 未打"，仅按硬顶判（合法分支，非失败路径）
#   红（退出 1）= 超硬顶或超基线 → 打回重新收敛
#   文件缺失 / 非 git 仓库 / 参数非法 = 退出 2（fail-closed，不放行）
# 标准调用命令登记处：项目 AGENTS.md 提交纪律节 / .aiops/docs/PROGRESS.md 收尾登记
# Windows 注意：git show "<tag>:<路径>" 路径带引号、以仓库根为基准；wc -c 直判不做管道转换
# 背景：治根文件反胖；与主控卡净减尺子（新增规则数 ≤ 删除规则数）并存

set -u

[ "$#" -ge 3 ] || {
    echo "[check-lean] 拦下：用法 check-lean.sh <基线tag> <硬顶字节> <文件...>" >&2
    exit 2
}
tag=$1
cap=$2
shift 2

git rev-parse --git-dir >/dev/null 2>&1 || {
    echo "[check-lean] 拦下：当前目录不是 git 仓库。" >&2
    exit 2
}
case "$cap" in
    '' | *[!0-9]*)
        echo "[check-lean] 拦下：硬顶字节必须是非负整数（得到：$cap）。" >&2
        exit 2
        ;;
esac

sum=0
for f in "$@"; do
    [ -f "$f" ] || {
        echo "[check-lean] 拦下：文件不存在：$f" >&2
        exit 2
    }
    bytes=$(wc -c < "$f")
    sum=$((sum + bytes))
done

echo "[check-lean] 当前合计 $sum B / 硬顶 $cap B"

if [ "$sum" -gt "$cap" ]; then
    echo "[check-lean] 红：合计超硬顶（$sum > $cap）。打回重新收敛。" >&2
    exit 1
fi

if git show-ref --verify --quiet "refs/tags/$tag"; then
    base=0
    for f in "$@"; do
        if git cat-file -e "$tag:$f" 2>/dev/null; then
            b=$(git show "$tag:$f" | wc -c)
        else
            echo "[check-lean] 拦下：文件 $f 不在基线 $tag 中（基线过期）。" >&2
            exit 2
        fi
        base=$((base + b))
    done
    echo "[check-lean] 基线 $tag 合计 $base B"
    if [ "$sum" -gt "$base" ]; then
        echo "[check-lean] 红：合计超基线 $tag（$sum > $base）。打回重新收敛。" >&2
        exit 1
    fi
else
    echo "[check-lean] 警告：基线 tag 未打（$tag 不存在），仅按硬顶判。"
fi

exit 0
