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
