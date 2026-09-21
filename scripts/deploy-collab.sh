#!/usr/bin/env bash
#
# 用途：wiki 实时协同服务（collab-server）一站式部署（在本地运行）
#       打包源码与依赖清单 → 上传 → 服务器 npm ci → 重启 → 端口健康检查
# 用法：./scripts/deploy-collab.sh [环境名]
#       环境名对应 scripts/deploy.<环境名>.env（多服务器场景；缺省读取 scripts/deploy.env）
#
# 前置：
#   已配置对应 env 文件（REMOTE_COLLAB_DIR / COLLAB_PORT / WIKI_INTERNAL_KEY）
#   服务器已安装 Node.js 22+ 与 npm（可用 NODE_BIN/NPM_BIN 指定绝对路径）
#
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
ROOT_DIR=$(cd -- "${SCRIPT_DIR}/.." &>/dev/null && pwd)

# 支持多服务器：第一个参数（或环境变量 WIKI_DEPLOY_ENV）指定环境名
ENV_NAME="${1:-${WIKI_DEPLOY_ENV:-}}"
ENV_FILE="${SCRIPT_DIR}/deploy.env"
if [ -n "${ENV_NAME}" ]; then
  ENV_FILE="${SCRIPT_DIR}/deploy.${ENV_NAME}.env"
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy] ERROR: 未找到 ${ENV_FILE}" >&2
  echo "[deploy]        请先执行：cp scripts/deploy.env.example ${ENV_FILE} 并填写" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

DEST="${REMOTE_COLLAB_DIR}"
COLLAB_PORT="${COLLAB_PORT:-18080}"
PID_FILE="${COLLAB_PID_FILE:-/home/www/eflink-wiki/.collab.pid}"
LOG_FILE="${COLLAB_LOG_FILE:-/home/www/eflink-wiki/collab.log}"
HEALTH_MAX_WAIT="${COLLAB_HEALTH_MAX_WAIT:-20}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"

SSH_BASE=(-p "${REMOTE_PORT:-22}")
SCP_BASE=(-P "${REMOTE_PORT:-22}")
if [ -n "${REMOTE_SSH_KEY:-}" ]; then
  SSH_BASE+=(-i "${REMOTE_SSH_KEY}")
  SCP_BASE+=(-i "${REMOTE_SSH_KEY}")
fi
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

cd "${ROOT_DIR}/collab-server"

echo "============================================"
echo "  eflink-wiki collab-server 一站式部署"
echo "  目标: ${SSH_TARGET}:${DEST}（端口 ${COLLAB_PORT}）"
echo "============================================"

# ============================================================
# 1. 本地打包（源码 + 依赖清单；依赖在服务器安装，无需上传 node_modules）
# ============================================================
echo ""
echo "[local] >>> 本地校验构建（tsc noEmit）..."
if ! npx tsc --noEmit; then
  echo "[local] ERROR: TypeScript 类型检查失败" >&2
  exit 1
fi

echo "[local] >>> 打包源码..."
TEMP_DIR=$(mktemp -d /tmp/eflink-collab-XXXXXX)
TEMP_TGZ="${TEMP_DIR}/collab-server.tar.gz"
tar -czf "${TEMP_TGZ}" src package.json package-lock.json tsconfig.json
echo "[local] 打包完成：${TEMP_TGZ}"

# ============================================================
# 2. 上传
# ============================================================
echo ""
echo "[local] >>> 确保服务器目录存在：${DEST}"
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" "mkdir -p '${DEST}' '$(dirname "${PID_FILE}")' '$(dirname "${LOG_FILE}")'"

echo "[local] >>> 上传到 ${SSH_TARGET}:/tmp/"
scp "${SCP_BASE[@]}" "${TEMP_TGZ}" "${SSH_TARGET}:/tmp/eflink-collab.tar.gz"
rm -rf "${TEMP_DIR}"
echo "[local] 上传完成"

# ============================================================
# 3. 服务器端部署
# ============================================================
echo ""
echo "[local] >>> 远程部署..."
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" bash -s -- "${DEST}" "${COLLAB_PORT}" "${PID_FILE}" "${LOG_FILE}" "${HEALTH_MAX_WAIT}" "${NODE_BIN}" "${NPM_BIN}" <<'REMOTE_SCRIPT'
set -euo pipefail

DEST=$1
COLLAB_PORT=$2
PID_FILE=$3
LOG_FILE=$4
HEALTH_MAX_WAIT=$5
NODE_BIN=$6
NPM_BIN=$7
ENV_FILE="$(dirname "${DEST}")/wiki.env"
TGZ="/tmp/eflink-collab.tar.gz"

port_busy() { command -v lsof >/dev/null 2>&1 && lsof -i :"${COLLAB_PORT}" >/dev/null 2>&1; }

# 停止旧进程
echo "[deploy] >>> 停止旧 collab-server..."
OLD_PID=""
[ -f "${PID_FILE}" ] && OLD_PID=$(cat "${PID_FILE}" 2>/dev/null || true)

stop_needed=false
{ [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; } && stop_needed=true
port_busy && stop_needed=true
pgrep -f "${DEST}/node_modules/tsx" >/dev/null 2>&1 && stop_needed=true

if [ "${stop_needed}" = true ]; then
  [ -n "${OLD_PID}" ] && kill -TERM "${OLD_PID}" 2>/dev/null || true
  pkill -TERM -f "${DEST}/node_modules/tsx" 2>/dev/null || true
  echo "[deploy] 已发送 SIGTERM，等待退出..."
  waited=0
  while [ "${waited}" -lt 10 ]; do
    alive=false
    { [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; } && alive=true
    port_busy && alive=true
    [ "${alive}" = false ] && break
    sleep 1
    waited=$((waited + 1))
  done
  port_busy && lsof -ti :"${COLLAB_PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  rm -f "${PID_FILE}"
  echo "[deploy] 旧进程已停止"
else
  echo "[deploy] 未发现运行中的 collab-server"
fi

# 解压 + 安装依赖
echo "[deploy] >>> 解压并安装依赖（npm ci）..."
tar -xzf "${TGZ}" -C "${DEST}"
rm -f "${TGZ}"
cd "${DEST}"
if [ -f package-lock.json ]; then
  "${NPM_BIN}" ci >/dev/null
else
  "${NPM_BIN}" install >/dev/null
fi
echo "[deploy] 依赖安装完成"

# 启动（加载共享 env：WIKI_INTERNAL_KEY / COLLAB_PORT / WIKI_BACKEND）
echo "[deploy] >>> 启动 collab-server（端口 ${COLLAB_PORT}）..."
set -a
if [ -f "${ENV_FILE}" ]; then . "${ENV_FILE}"; fi
set +a
nohup "${NODE_BIN}" node_modules/tsx/dist/cli.mjs src/index.ts >> "${LOG_FILE}" 2>&1 &
NEW_PID=$!
echo "${NEW_PID}" > "${PID_FILE}"
echo "[deploy] 已启动，PID=${NEW_PID}，日志=${LOG_FILE}"

# 健康检查：等待端口可建立 TCP 连接
echo "[deploy] 等待启动..."
elapsed=0
healthy=false
while [ "${elapsed}" -lt "${HEALTH_MAX_WAIT}" ]; do
  if (exec 3<>/dev/tcp/127.0.0.1/"${COLLAB_PORT}") 2>/dev/null; then
    exec 3>&- 3<&- || true
    echo "[deploy] collab-server 启动成功！（耗时 ${elapsed}s）"
    healthy=true
    break
  fi
  if ! kill -0 "${NEW_PID}" 2>/dev/null; then
    echo "[deploy] ERROR: 进程 ${NEW_PID} 已退出，启动失败。日志末尾：" >&2
    tail -20 "${LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if [ "${healthy}" != true ]; then
  echo "[deploy] WARN: ${HEALTH_MAX_WAIT}s 内端口未就绪，请查日志：tail -f ${LOG_FILE}"
fi
REMOTE_SCRIPT

echo ""
echo "============================================"
echo "  collab-server 部署完成！"
echo "============================================"
