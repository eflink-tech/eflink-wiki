#!/usr/bin/env bash
# 构建后端 jar（跳过 jOOQ 生成提速；改表后请先单独跑 ./gradlew :wiki-store:generateJooq）
set -e
cd "$(dirname "$0")/.."
./gradlew clean :wiki-app:bootJar -x :wiki-store:generateJooq
mkdir -p dist-release
cp wiki-app/build/libs/wiki-app-*.jar dist-release/eflink-wiki-server.jar
echo "产物: dist-release/eflink-wiki-server.jar（默认不嵌入前端；EMBED_FRONTEND=1 可打进 jar）"
echo "运行: java -jar dist-release/eflink-wiki-server.jar（需 JDK 21 + MySQL 8，首次启动 Flyway 自动建表，访问 /api/setup 初始化管理员）"
