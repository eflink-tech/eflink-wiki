#!/usr/bin/env bash
#
# 用途：远程重启 wiki 后端 + 实时协同服务（在本地运行；不构建、不上传）
#       适用场景：修改远端 wiki.env 配置后重启生效、服务异常后拉起
#       需要换包发布请用 ./scripts/deploy-backend.sh
# 说明：两服务均已 systemd 托管（eflink-wiki.service / eflink-collab.service，开机自启），
#       本脚本只做 systemctl 重启 + 健康检查，勿再用 nohup 手拉（会与单元抢端口）
# 用法：./scripts/restart-backend.sh [环境名]
#       环境名对应 scripts/deploy.<环境名>.env（多服务器场景；缺省读取 scripts/deploy.env）
#
# 前置：已配置对应 env 文件
#
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

# 支持多服务器：第一个参数（或环境变量 WIKI_DEPLOY_ENV）指定环境名
ENV_NAME="${1:-${WIKI_DEPLOY_ENV:-}}"
ENV_FILE="${SCRIPT_DIR}/deploy.env"
if [ -n "${ENV_NAME}" ]; then
  ENV_FILE="${SCRIPT_DIR}/deploy.${ENV_NAME}.env"
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "[restart] ERROR: 未找到 ${ENV_FILE}" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

APP_PORT="${APP_PORT:-8090}"
COLLAB_PORT="${COLLAB_PORT:-18080}"
BACKEND_HEALTH_MAX_WAIT="${BACKEND_HEALTH_MAX_WAIT:-90}"
COLLAB_HEALTH_MAX_WAIT="${COLLAB_HEALTH_MAX_WAIT:-30}"

SSH_BASE=(-p "${REMOTE_PORT:-22}")
if [ -n "${REMOTE_SSH_KEY:-}" ]; then
  SSH_BASE+=(-i "${REMOTE_SSH_KEY}")
fi
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

echo "============================================"
echo "  eflink-wiki 后端 + collab 重启（不换包）"
echo "  目标: ${SSH_TARGET}（后端 ${APP_PORT} / collab ${COLLAB_PORT}）"
echo "============================================"

ssh "${SSH_BASE[@]}" "${SSH_TARGET}" bash -s -- "${APP_PORT}" "${COLLAB_PORT}" "${BACKEND_HEALTH_MAX_WAIT}" "${COLLAB_HEALTH_MAX_WAIT}" <<'REMOTE_SCRIPT'
set -euo pipefail

APP_PORT=$1
COLLAB_PORT=$2
BACKEND_HEALTH_MAX_WAIT=$3
COLLAB_HEALTH_MAX_WAIT=$4

port_busy() { command -v lsof >/dev/null 2>&1 && lsof -i :"$1" >/dev/null 2>&1; }

# 单元必须就位：没有 systemd 单元说明该机未完成托管改造，拒绝退化成 nohup 模式
for unit in eflink-wiki eflink-collab; do
  if ! systemctl cat "$unit.service" >/dev/null 2>&1; then
    echo "[restart] ERROR: 未找到 systemd 单元 $unit.service，请先按运维文档部署单元文件" >&2
    exit 1
  fi
done

# 1. 重启 wiki 后端
echo "[restart] >>> systemctl restart eflink-wiki..."
systemctl restart eflink-wiki.service

echo "[restart] 等待后端启动（端口 ${APP_PORT}）..."
elapsed=0
healthy=false
while [ "$elapsed" -lt "$BACKEND_HEALTH_MAX_WAIT" ]; do
  if command -v curl >/dev/null 2>&1 && curl -sf "http://localhost:${APP_PORT}/actuator/health" >/dev/null 2>&1; then
    echo "[restart] 后端启动成功！（耗时 ${elapsed}s）"
    healthy=true
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
if [ "$healthy" != true ]; then
  echo "[restart] ERROR: 后端 ${BACKEND_HEALTH_MAX_WAIT}s 内健康检查未通过，日志：journalctl -u eflink-wiki -n 50" >&2
  journalctl -u eflink-wiki -n 20 --no-pager >&2 || true
  exit 1
fi

# 2. 重启 collab（依赖后端就绪；配置读取 /home/www/eflink-wiki/wiki.env）
echo "[restart] >>> systemctl restart eflink-collab..."
systemctl restart eflink-collab.service

echo "[restart] 等待 collab 启动（端口 ${COLLAB_PORT}）..."
elapsed=0
healthy=false
while [ "$elapsed" -lt "$COLLAB_HEALTH_MAX_WAIT" ]; do
  if (exec 3<>/dev/tcp/127.0.0.1/"${COLLAB_PORT}") 2>/dev/null; then
    exec 3>&- 3<&- || true
    echo "[restart] collab 启动成功！（耗时 ${elapsed}s）"
    healthy=true
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if [ "$healthy" != true ]; then
  echo "[restart] ERROR: collab ${COLLAB_HEALTH_MAX_WAIT}s 内端口 ${COLLAB_PORT} 未就绪，日志：journalctl -u eflink-collab -n 50" >&2
  journalctl -u eflink-collab -n 20 --no-pager >&2 || true
  exit 1
fi

systemctl is-active eflink-wiki.service eflink-collab.service
REMOTE_SCRIPT

echo ""
echo "============================================"
echo "  重启完成！（wiki + collab 均已就绪）"
echo "============================================"
