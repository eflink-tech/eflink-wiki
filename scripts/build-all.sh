#!/usr/bin/env bash
# 前后端独立出包（默认不再把前端打进 jar）
# 产物:
#   frontend/dist-release/              前端静态资源
#   backend/dist-release/eflink-wiki-server.jar  后端 API
# 兼容旧单包: bash scripts/build-all.sh --embedded
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EMBED=0
if [ "${1:-}" = "--embedded" ]; then
  EMBED=1
fi

echo "==> 1/2 构建前端"
bash "$ROOT/scripts/build-frontend.sh"

if [ "$EMBED" = "1" ]; then
  echo "==> 拷贝前端产物到后端静态资源（单 jar 模式）"
  rm -rf "$ROOT/backend/wiki-app/src/main/resources/static"
  mkdir -p "$ROOT/backend/wiki-app/src/main/resources/static"
  cp -R "$ROOT/frontend/dist/." "$ROOT/backend/wiki-app/src/main/resources/static/"
  export EMBED_FRONTEND=1
fi

echo "==> 2/2 构建后端"
bash "$ROOT/scripts/build-backend.sh"

echo
echo "前端: $ROOT/frontend/dist-release/"
echo "后端: $ROOT/backend/dist-release/eflink-wiki-server.jar"
if [ "$EMBED" = "1" ]; then
  echo "模式: 单 jar 内嵌前端，java -jar 即可"
else
  echo "模式: 前后端独立部署，参考 deploy/nginx.conf.example"
fi
