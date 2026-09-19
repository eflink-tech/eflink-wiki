#!/usr/bin/env bash
# 开发辅助：重置本地数据库（危险操作！仅用于开发期重建 schema）
set -e
DB_NAME='eflink-wiki'
read -p "确认删除并重建本地库 ${DB_NAME}? (y/N): " confirm
if [ "$confirm" != "y" ]; then echo "已取消"; exit 0; fi
mysql -h127.0.0.1 -uroot -p"${SPRING_DATASOURCE_PASSWORD:-123456}" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "已重建空库 ${DB_NAME}（下次启动应用时 Flyway 自动建表）"
