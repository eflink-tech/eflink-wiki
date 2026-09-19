#!/usr/bin/env bash
# 独立构建前端静态资源（不拷入后端 jar）
# 产物: frontend/dist-release/ （含 version.json，供已打开页面发现新版本）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"
pnpm install
export WIKI_FRONTEND_VERSION="${WIKI_FRONTEND_VERSION:-$(date +%s)}"
pnpm build
rm -rf "$ROOT/frontend/dist-release"
mkdir -p "$ROOT/frontend/dist-release"
cp -R dist/. "$ROOT/frontend/dist-release/"
echo "完成: frontend/dist-release/"
if [ -f dist/version.json ]; then
  echo "版本: $(cat dist/version.json)"
fi
echo "部署: 将 dist-release/ 放到 nginx 站点根目录，/api 与 /uploads 反代到后端 8090"
