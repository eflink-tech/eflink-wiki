#!/usr/bin/env bash
# 独立构建后端 API jar（默认不嵌入前端静态资源）
# 产物: backend/dist-release/eflink-wiki-server.jar
# 可选: EMBED_FRONTEND=1 时把 frontend/dist 打进 jar（兼容旧的单包部署）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
if [ "${EMBED_FRONTEND:-0}" = "1" ]; then
  echo "==> 嵌入前端静态资源到 jar"
  ./gradlew clean :wiki-app:bootJar -x :wiki-store:generateJooq -PembedFrontend=true
else
  ./gradlew clean :wiki-app:bootJar -x :wiki-store:generateJooq
fi
mkdir -p dist-release
cp wiki-app/build/libs/wiki-app-*.jar dist-release/eflink-wiki-server.jar
echo "完成: backend/dist-release/eflink-wiki-server.jar"
echo "运行: java -jar dist-release/eflink-wiki-server.jar （JDK 21 + MySQL 8）"
