#!/bin/sh
# 管家安装兼容入口：业务逻辑统一由跨平台 Node 核心执行。
# 用法：init-project.sh <目标目录> <项目名> [宿主标识]
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "用法: init-project.sh <目标目录> <项目名> [宿主标识]" >&2
  exit 2
fi

DEST=$1
NAME=$2
HOST=${3:-generic}
TEMPLATE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CORE="$TEMPLATE_ROOT/guanjia/bin/guanjia.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js。请安装 Node.js 18+（推荐 22+）后重试；本脚本不会静默安装运行时。" >&2
  exit 3
fi
if [ ! -f "$CORE" ]; then
  echo "安装包不完整：缺少 $CORE" >&2
  exit 3
fi

exec node "$CORE" init --project "$DEST" --name "$NAME" --host "$HOST"
