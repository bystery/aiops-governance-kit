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
