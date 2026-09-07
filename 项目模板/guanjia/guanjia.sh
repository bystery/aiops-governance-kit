#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
command -v node >/dev/null 2>&1 || { echo "[guanjia] 找不到 Node.js 18+。" >&2; exit 3; }
exec node "$SCRIPT_DIR/bin/guanjia.mjs" "$@" --project "$PROJECT_ROOT"
