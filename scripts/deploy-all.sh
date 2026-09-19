#!/usr/bin/env bash
#
# 用途：wiki 全量部署（在本地运行）：按依赖顺序依次部署 后端 → 协同服务 → 前端
# 用法：./scripts/deploy-all.sh [--skip-collab]
#       --skip-collab  跳过协同服务（未启用实时协同的服务器）
#
# 前置：已配置 scripts/deploy.env（三个组件共用同一份 SSH/目录/密钥配置）
#
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

SKIP_COLLAB=false
for arg in "$@"; do
  case "$arg" in
    --skip-collab) SKIP_COLLAB=true ;;
    *) echo "未知参数：$arg" >&2; exit 1 ;;
  esac
done

FAILED=""

echo "########## [1/3] 后端 ##########"
if ! bash "${SCRIPT_DIR}/deploy-backend.sh"; then
  FAILED="${FAILED} backend"
  echo "[deploy-all] ERROR: 后端部署失败，继续部署其余组件（汇总见末尾）" >&2
fi

if [ "${SKIP_COLLAB}" != true ]; then
  echo ""
  echo "########## [2/3] 协同服务 ##########"
  if ! bash "${SCRIPT_DIR}/deploy-collab.sh"; then
    FAILED="${FAILED} collab-server"
    echo "[deploy-all] ERROR: 协同服务部署失败，继续部署前端（汇总见末尾）" >&2
  fi
else
  echo ""
  echo "########## [2/3] 协同服务（--skip-collab 已跳过）##########"
fi

echo ""
echo "########## [3/3] 前端 ##########"
if ! bash "${SCRIPT_DIR}/deploy-frontend.sh"; then
  FAILED="${FAILED} frontend"
  echo "[deploy-all] ERROR: 前端部署失败（汇总见末尾）" >&2
fi

echo ""
if [ -n "${FAILED}" ]; then
  echo "============================================"
  echo "  部署完成（部分失败：${FAILED}），请查看上方日志"
  echo "============================================"
  exit 1
fi

echo "============================================"
echo "  全部部署完成！"
echo "============================================"
