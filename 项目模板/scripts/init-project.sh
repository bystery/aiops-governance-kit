#!/bin/sh
# init-project.sh <目标目录> <项目名> —— 盖章式生成新项目 .aiops/ 骨架（不交互、不覆盖）
# 行为测试：init-project.sh /tmp/test-project 测试项目 → 产物 ≥24 项逐项存在 → 退出 0；同目录重跑 → 退出 2
set -u
[ $# -eq 2 ] || { echo "用法: init-project.sh <目标目录> <项目名>"; exit 2; }
DEST=$1; NAME=$2
SRC=$(cd "$(dirname "$0")/.." && pwd)   # 项目模板/ 根
[ -d "$SRC/.aiops" ] || { echo "模板缺 .aiops/（应在项目模板/ 下运行）"; exit 2; }
[ -e "$DEST/.aiops" ] && { echo "拦下：$DEST/.aiops 已存在（盖章不重印）"; exit 2; }
[ -d "$DEST" ] || mkdir -p "$DEST" || exit 2
mkdir -p "$DEST/.aiops/docs/decisions" "$DEST/.aiops/docs/archive/归档件模板" "$DEST/.aiops/agents" "$DEST/.aiops/scripts/hooks" || exit 2
rend() { sed "s/<项目名>/$NAME/g" "$1" > "$2"; }
rend "$SRC/.aiops/AGENTS.md.template"            "$DEST/.aiops/AGENTS.md"
rend "$SRC/.aiops/docs/PROGRESS.md.template"     "$DEST/.aiops/docs/PROGRESS.md"
cp  "$SRC/.aiops/docs/backlog.md.template"       "$DEST/.aiops/docs/backlog.md"
cp  "$SRC/.aiops/docs/错误模式清单.md.template"  "$DEST/.aiops/docs/错误模式清单.md"
rend "$SRC/.aiops/读集.md.template"              "$DEST/.aiops/读集.md"
cp  "$SRC/.aiops/docs/decisions/ADR-模板.md.template" "$DEST/.aiops/docs/decisions/ADR-模板.md"
cp  "$SRC/.aiops/docs/archive/归档说明.md.template"   "$DEST/.aiops/docs/archive/"
for f in "$SRC"/.aiops/docs/archive/归档件模板/*.template; do cp "$f" "$DEST/.aiops/docs/archive/归档件模板/"; done
rend "$SRC/.aiops/主人面板.md.template"          "$DEST/.aiops/主人面板.md"
rend "$SRC/.aiops/agents/宿主映射表.md.template" "$DEST/.aiops/agents/宿主映射表.md"
cp "$SRC"/.aiops/scripts/hooks/* "$DEST/.aiops/scripts/hooks/"
rend "$SRC/AGENTS.md.template" "$DEST/AGENTS.md"
echo "已生成 $DEST/.aiops/（项目：$NAME）。激活机械门禁：cd $DEST && git config core.hooksPath .aiops/scripts/hooks"
exit 0
