#!/usr/bin/env bash
#
# 用途：远程重启 wiki 后端（在本地运行；不构建、不上传）
#       适用场景：修改远端 wiki.env 配置后重启生效、服务异常后拉起
#       需要换包发布请用 ./scripts/deploy-backend.sh
# 用法：./scripts/restart-backend.sh
#
# 前置：已配置 scripts/deploy.env
#
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
ENV_FILE="${SCRIPT_DIR}/deploy.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[restart] ERROR: 未找到 ${ENV_FILE}" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

JAR_DEST="${REMOTE_JAR_PATH}"
PID_FILE="${REMOTE_PID_FILE}"
LOG_FILE="${REMOTE_LOG_FILE}"
APP_PORT="${APP_PORT:-8090}"
ENV_DEST="$(dirname "${JAR_DEST}")/wiki.env"
JAVA_OPTS="${JAVA_OPTS:-}"
SHUTDOWN_TIMEOUT="${SHUTDOWN_TIMEOUT:-15}"
HEALTH_MAX_WAIT="${HEALTH_MAX_WAIT:-60}"

SSH_BASE=(-p "${REMOTE_PORT:-22}")
if [ -n "${REMOTE_SSH_KEY:-}" ]; then
  SSH_BASE+=(-i "${REMOTE_SSH_KEY}")
fi
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

echo "============================================"
echo "  eflink-wiki 后端重启（不换包）"
echo "  目标: ${SSH_TARGET}:${JAR_DEST}（端口 ${APP_PORT}）"
echo "============================================"

ssh "${SSH_BASE[@]}" "${SSH_TARGET}" bash -s -- "${APP_PORT}" "${JAVA_OPTS-}" <<REMOTE_SCRIPT
set -euo pipefail

APP_PORT=\$1
JAVA_OPTS=\$2
ENV_DEST="$(dirname "${JAR_DEST}")/wiki.env"

port_busy() { command -v lsof >/dev/null 2>&1 && lsof -i :"\${APP_PORT}" >/dev/null 2>&1; }

if [ ! -f "${JAR_DEST}" ]; then
  echo "[restart] ERROR: 远端未找到 JAR：${JAR_DEST}，请先执行 ./scripts/deploy-backend.sh" >&2
  exit 1
fi

# 停止旧进程（只匹配 eflink-wiki-server.jar，不影响同机其他 Java 服务）
echo "[restart] >>> 停止旧后端进程..."
OLD_PID=""
[ -f "${PID_FILE}" ] && OLD_PID=\$(cat "${PID_FILE}" 2>/dev/null || true)

stop_needed=false
{ [ -n "\${OLD_PID}" ] && kill -0 "\${OLD_PID}" 2>/dev/null; } && stop_needed=true
port_busy && stop_needed=true
pgrep -f 'eflink-wiki-server\.jar' >/dev/null 2>&1 && stop_needed=true

if [ "\${stop_needed}" = true ]; then
  [ -n "\${OLD_PID}" ] && kill -TERM "\${OLD_PID}" 2>/dev/null || true
  pkill -TERM -f 'eflink-wiki-server\.jar' 2>/dev/null || true
  echo "[restart] 已发送 SIGTERM，等待退出（最多 ${SHUTDOWN_TIMEOUT}s）..."
  waited=0
  while [ "\${waited}" -lt "${SHUTDOWN_TIMEOUT}" ]; do
    alive=false
    { [ -n "\${OLD_PID}" ] && kill -0 "\${OLD_PID}" 2>/dev/null; } && alive=true
    port_busy && alive=true
    [ "\${alive}" = false ] && break
    sleep 1
    waited=\$((waited + 1))
  done
  if port_busy; then
    echo "[restart] 超时，强制清理端口 \${APP_PORT} 占用者..."
    lsof -ti :"\${APP_PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    sleep 1
  fi
  rm -f "${PID_FILE}"
  echo "[restart] 旧进程已停止"
else
  echo "[restart] 未发现运行中的后端（将直接启动）"
fi

# 启动（加载共享 env：数据库/JWT/协同密钥/存储/IM 推送等）
echo "[restart] >>> 启动后端（端口 \${APP_PORT}）..."
set -a
if [ -f "\${ENV_DEST}" ]; then . "\${ENV_DEST}"; fi
set +a
nohup java \${JAVA_OPTS} -jar "${JAR_DEST}" --server.port="\${APP_PORT}" >> "${LOG_FILE}" 2>&1 &
NEW_PID=\$!
echo "\${NEW_PID}" > "${PID_FILE}"
echo "[restart] 已启动，PID=\${NEW_PID}，日志=${LOG_FILE}"

# 健康检查
echo "[restart] 等待启动..."
elapsed=0
healthy=false
while [ "\${elapsed}" -lt "${HEALTH_MAX_WAIT}" ]; do
  if command -v curl >/dev/null 2>&1 && curl -sf "http://localhost:\${APP_PORT}/actuator/health" >/dev/null 2>&1; then
    echo "[restart] 后端启动成功！（耗时 \${elapsed}s）"
    healthy=true
    break
  fi
  if ! kill -0 "\${NEW_PID}" 2>/dev/null; then
    echo "[restart] ERROR: 进程 \${NEW_PID} 已退出，启动失败。日志末尾：" >&2
    tail -20 "${LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 2
  elapsed=\$((elapsed + 2))
done
if [ "\${healthy}" != true ]; then
  echo "[restart] WARN: ${HEALTH_MAX_WAIT}s 内健康检查未通过，请查日志：tail -f ${LOG_FILE}"
fi
REMOTE_SCRIPT

echo ""
echo "============================================"
echo "  重启完成！"
echo "============================================"
