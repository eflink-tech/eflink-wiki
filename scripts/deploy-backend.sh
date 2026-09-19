#!/usr/bin/env bash
#
# 用途：wiki 后端一站式部署（在本地运行）
#       编译 JAR → 上传 → 服务器部署（停旧进程→换 JAR→启动→健康检查）
# 用法：./scripts/deploy-backend.sh
#
# 前置：已配置 scripts/deploy.env（参考 deploy.env.example）
#
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
ROOT_DIR=$(cd -- "${SCRIPT_DIR}/.." &>/dev/null && pwd)
ENV_FILE="${SCRIPT_DIR}/deploy.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy] ERROR: 未找到 ${ENV_FILE}" >&2
  echo "[deploy]        请先执行：cp scripts/deploy.env.example scripts/deploy.env 并填写" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

JAR_DEST="${REMOTE_JAR_PATH}"
PID_FILE="${REMOTE_PID_FILE}"
LOG_FILE="${REMOTE_LOG_FILE}"
APP_PORT="${APP_PORT:-8090}"
JAVA_OPTS="${JAVA_OPTS:-}"
SHUTDOWN_TIMEOUT="${SHUTDOWN_TIMEOUT:-15}"
HEALTH_MAX_WAIT="${HEALTH_MAX_WAIT:-60}"

# 注意：ssh 指定端口用 -p（小写），scp 用 -P（大写）
SSH_BASE=(-p "${REMOTE_PORT:-22}")
SCP_BASE=(-P "${REMOTE_PORT:-22}")
if [ -n "${REMOTE_SSH_KEY:-}" ]; then
  SSH_BASE+=(-i "${REMOTE_SSH_KEY}")
  SCP_BASE+=(-i "${REMOTE_SSH_KEY}")
fi
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

cd "${ROOT_DIR}"

echo "============================================"
echo "  eflink-wiki 后端一站式部署"
echo "  目标: ${SSH_TARGET}:${JAR_DEST}（端口 ${APP_PORT}）"
echo "============================================"

# ============================================================
# 1. 本地编译
# ============================================================
echo ""
echo "[local] >>> Gradle bootJar..."
if ! (cd backend && ./gradlew clean :wiki-app:bootJar -x :wiki-store:generateJooq); then
  echo "[local] ERROR: 后端构建失败" >&2
  exit 1
fi

JAR_PATH=$(ls "${ROOT_DIR}"/backend/wiki-app/build/libs/wiki-app-*.jar 2>/dev/null | grep -v plain | head -1 || true)
if [ -z "${JAR_PATH}" ] || [ ! -f "${JAR_PATH}" ]; then
  echo "[local] ERROR: 未找到可执行 JAR" >&2
  exit 1
fi
echo "[local] 后端 JAR: $(basename "${JAR_PATH}")"

# ============================================================
# 2. 上传到服务器（JAR + 服务端环境变量文件）
# ============================================================
echo ""
echo "[local] >>> 确保服务器目录存在"
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" "mkdir -p '$(dirname "${JAR_DEST}")' '$(dirname "${PID_FILE}")' '$(dirname "${LOG_FILE}")'"

echo "[local] >>> 上传 JAR 到 ${SSH_TARGET}:${JAR_DEST}.new"
scp "${SCP_BASE[@]}" "${JAR_PATH}" "${SSH_TARGET}:${JAR_DEST}.new"
echo "[local] 上传完成"

# 生成远端共享 env（后端与 collab-server 共用；只写非空项，含密钥故权限 600）
# 用 printf %q 做 shell 安全转义（值里含单引号/空格/特殊字符均可安全 source）
ENV_DEST="$(dirname "${JAR_DEST}")/wiki.env"
{
  echo "# 由 scripts/deploy-*.sh 自动生成（$(date '+%F %T')）；也可手工修改，服务重启时读取"
  [ -n "${WIKI_JWT_SECRET:-}" ]       && printf 'WIKI_JWT_SECRET=%q\n' "${WIKI_JWT_SECRET}"
  [ -n "${WIKI_INTERNAL_KEY:-}" ]     && printf 'WIKI_INTERNAL_KEY=%q\n' "${WIKI_INTERNAL_KEY}"
  [ -n "${WIKI_BASE_URL:-}" ]         && printf 'WIKI_BASE_URL=%q\n' "${WIKI_BASE_URL}"
  [ -n "${DINGTALK_WEBHOOK:-}" ]      && printf 'DINGTALK_WEBHOOK=%q\n' "${DINGTALK_WEBHOOK}"
  [ -n "${DINGTALK_SECRET:-}" ]       && printf 'DINGTALK_SECRET=%q\n' "${DINGTALK_SECRET}"
  [ -n "${FEISHU_WEBHOOK:-}" ]        && printf 'FEISHU_WEBHOOK=%q\n' "${FEISHU_WEBHOOK}"
  [ -n "${QINIU_ACCESS_KEY:-}" ]      && printf 'QINIU_ACCESS_KEY=%q\n' "${QINIU_ACCESS_KEY}"
  [ -n "${QINIU_SECRET_KEY:-}" ]      && printf 'QINIU_SECRET_KEY=%q\n' "${QINIU_SECRET_KEY}"
  [ -n "${QINIU_BUCKET:-}" ]          && printf 'QINIU_BUCKET=%q\n' "${QINIU_BUCKET}"
  [ -n "${QINIU_DOMAIN:-}" ]          && printf 'QINIU_DOMAIN=%q\n' "${QINIU_DOMAIN}"
  [ -n "${QINIU_ZONE:-}" ]            && printf 'QINIU_ZONE=%q\n' "${QINIU_ZONE}"
  [ -n "${QINIU_PRIVATE_BUCKET:-}" ]  && printf 'QINIU_PRIVATE_BUCKET=%q\n' "${QINIU_PRIVATE_BUCKET}"
  [ -n "${QINIU_WIKI_KEY_PREFIX:-}" ] && printf 'QINIU_WIKI_KEY_PREFIX=%q\n' "${QINIU_WIKI_KEY_PREFIX}"
  [ -n "${WECOM_WEBHOOK:-}" ]         && printf 'WECOM_WEBHOOK=%q\n' "${WECOM_WEBHOOK}"
  [ -n "${SPRING_DATASOURCE_URL:-}" ] && printf 'SPRING_DATASOURCE_URL=%q\n' "${SPRING_DATASOURCE_URL}"
  [ -n "${SPRING_DATASOURCE_USERNAME:-}" ] && printf 'SPRING_DATASOURCE_USERNAME=%q\n' "${SPRING_DATASOURCE_USERNAME}"
  [ -n "${SPRING_DATASOURCE_PASSWORD:-}" ] && printf 'SPRING_DATASOURCE_PASSWORD=%q\n' "${SPRING_DATASOURCE_PASSWORD}"
  [ -n "${SPRING_FLYWAY_BASELINE_VERSION:-}" ] && printf 'SPRING_FLYWAY_BASELINE_VERSION=%q\n' "${SPRING_FLYWAY_BASELINE_VERSION}"
  [ -n "${COLLAB_PORT:-}" ]           && printf 'COLLAB_PORT=%q\n' "${COLLAB_PORT}"
  true
} > /tmp/eflink-wiki.env
echo "[local] >>> 上传环境变量 → ${ENV_DEST}"
scp "${SCP_BASE[@]}" /tmp/eflink-wiki.env "${SSH_TARGET}:${ENV_DEST}"
rm -f /tmp/eflink-wiki.env
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" "chmod 600 '${ENV_DEST}'"

# ============================================================
# 3. 服务器端部署（通过 SSH 执行）
# ============================================================
echo ""
echo "[local] >>> 远程部署..."
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" bash -s -- "${APP_PORT}" "${JAVA_OPTS-}" <<REMOTE_SCRIPT
set -euo pipefail

APP_PORT=\$1
JAVA_OPTS=\$2
ENV_DEST="$(dirname "${JAR_DEST}")/wiki.env"

port_busy() { command -v lsof >/dev/null 2>&1 && lsof -i :"\${APP_PORT}" >/dev/null 2>&1; }

# 停止旧进程（只匹配 eflink-wiki-server.jar，不影响同机其他 Java 服务）
echo "[deploy] >>> 停止旧后端进程..."
OLD_PID=""
[ -f "${PID_FILE}" ] && OLD_PID=\$(cat "${PID_FILE}" 2>/dev/null || true)

stop_needed=false
{ [ -n "\${OLD_PID}" ] && kill -0 "\${OLD_PID}" 2>/dev/null; } && stop_needed=true
port_busy && stop_needed=true
pgrep -f 'eflink-wiki-server\.jar' >/dev/null 2>&1 && stop_needed=true

if [ "\${stop_needed}" = true ]; then
  [ -n "\${OLD_PID}" ] && kill -TERM "\${OLD_PID}" 2>/dev/null || true
  pkill -TERM -f 'eflink-wiki-server\.jar' 2>/dev/null || true
  echo "[deploy] 已发送 SIGTERM，等待退出（最多 ${SHUTDOWN_TIMEOUT}s）..."
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
    echo "[deploy] 超时，强制清理端口 \${APP_PORT} 占用者..."
    lsof -ti :"\${APP_PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    sleep 1
  fi
  rm -f "${PID_FILE}"
  echo "[deploy] 旧进程已停止"
else
  echo "[deploy] 未发现运行中的后端"
fi

# 备份并替换 JAR
echo "[deploy] >>> 替换 JAR..."
if [ -f "${JAR_DEST}" ]; then
  cp -f "${JAR_DEST}" "${JAR_DEST}.bak"
  echo "[deploy] 已备份旧 JAR → ${JAR_DEST}.bak"
fi
mv -f "${JAR_DEST}.new" "${JAR_DEST}"
chmod +x "${JAR_DEST}"
echo "[deploy] JAR 已就位：${JAR_DEST}"

# 启动（加载共享 env：JWT/协同密钥/存储/IM 推送等）
echo "[deploy] >>> 启动后端（端口 \${APP_PORT}）..."
set -a
if [ -f "\${ENV_DEST}" ]; then . "\${ENV_DEST}"; fi
set +a
nohup java \${JAVA_OPTS} -jar "${JAR_DEST}" --server.port="\${APP_PORT}" >> "${LOG_FILE}" 2>&1 &
NEW_PID=\$!
echo "\${NEW_PID}" > "${PID_FILE}"
echo "[deploy] 已启动，PID=\${NEW_PID}，日志=${LOG_FILE}"

# 健康检查
echo "[deploy] 等待启动..."
elapsed=0
healthy=false
while [ "\${elapsed}" -lt "${HEALTH_MAX_WAIT}" ]; do
  if command -v curl >/dev/null 2>&1 && curl -sf "http://localhost:\${APP_PORT}/actuator/health" >/dev/null 2>&1; then
    echo "[deploy] 后端启动成功！（耗时 \${elapsed}s）"
    healthy=true
    break
  fi
  if ! kill -0 "\${NEW_PID}" 2>/dev/null; then
    echo "[deploy] ERROR: 进程 \${NEW_PID} 已退出，启动失败。日志末尾：" >&2
    tail -20 "${LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 2
  elapsed=\$((elapsed + 2))
done
if [ "\${healthy}" != true ]; then
  echo "[deploy] WARN: ${HEALTH_MAX_WAIT}s 内健康检查未通过，请查日志：tail -f ${LOG_FILE}"
fi
REMOTE_SCRIPT

echo ""
echo "============================================"
echo "  后端部署完成！"
echo "============================================"
