#!/usr/bin/env bash
#
# 用途：wiki 前端一站式部署（在本地运行）
#       本机构建（依赖 monorepo 兄弟目录 @eflink-tech/* 软链，构建必须在本机完成）
#       → 上传 → 服务器部署（备份旧版本→清空并解压→reload nginx）
# 用法：./scripts/deploy-frontend.sh
#
# 前置：已配置 scripts/deploy.env（REMOTE_FRONTEND_DIR）
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

DEST="${REMOTE_FRONTEND_DIR}"
BACKUP_PATH="${DEST}.bak.tar.gz"

SSH_BASE=(-p "${REMOTE_PORT:-22}")
SCP_BASE=(-P "${REMOTE_PORT:-22}")
if [ -n "${REMOTE_SSH_KEY:-}" ]; then
  SSH_BASE+=(-i "${REMOTE_SSH_KEY}")
  SCP_BASE+=(-i "${REMOTE_SSH_KEY}")
fi
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

cd "${ROOT_DIR}"

echo "============================================"
echo "  eflink-wiki 前端一站式部署"
echo "  目标: ${SSH_TARGET}:${DEST}"
echo "============================================"

# ============================================================
# 1. 本地构建（复用现有出包脚本，含 version.json 版本号注入）
# ============================================================
echo ""
if ! bash scripts/build-frontend.sh; then
  echo "[local] ERROR: 前端构建失败" >&2
  exit 1
fi

if [ ! -f "${ROOT_DIR}/frontend/dist-release/index.html" ]; then
  echo "[local] ERROR: 未产出 dist-release/index.html" >&2
  exit 1
fi

# ============================================================
# 2. 打包
# ============================================================
echo ""
echo "[local] >>> 打包产物..."
TEMP_DIR=$(mktemp -d /tmp/eflink-wiki-frontend-XXXXXX)
TEMP_ZIP="${TEMP_DIR}/eflink-wiki-frontend.zip"
(
  cd "${ROOT_DIR}/frontend/dist-release" || exit 1
  if command -v zip >/dev/null 2>&1; then
    zip -rq "${TEMP_ZIP}" .
  else
    python3 - "${TEMP_ZIP}" <<'PY'
import zipfile, os, sys
out = sys.argv[1]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        for f in files:
            full = os.path.join(root, f)
            zf.write(full, os.path.relpath(full, '.'))
PY
  fi
)
echo "[local] 打包完成：${TEMP_ZIP}"

# ============================================================
# 3. 上传
# ============================================================
echo ""
echo "[local] >>> 确保服务器目录存在：${DEST}"
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" "mkdir -p '${DEST}'"

echo "[local] >>> 上传 zip 到 ${SSH_TARGET}:/tmp/"
scp "${SCP_BASE[@]}" "${TEMP_ZIP}" "${SSH_TARGET}:/tmp/eflink-wiki-frontend.zip"
rm -rf "${TEMP_DIR}"
echo "[local] 上传完成"

# ============================================================
# 4. 服务器端部署
# ============================================================
echo ""
echo "[local] >>> 远程部署..."
ssh "${SSH_BASE[@]}" "${SSH_TARGET}" bash -s -- "${DEST}" "${BACKUP_PATH}" <<'REMOTE_SCRIPT'
set -euo pipefail

DEST=$1
BACKUP_PATH=$2
ZIP_SRC="/tmp/eflink-wiki-frontend.zip"

if [ ! -f "${ZIP_SRC}" ]; then
  echo "[deploy] ERROR: 缺少产物 ${ZIP_SRC}" >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "[deploy] ERROR: 需要 unzip 或 python3 来解压" >&2
  exit 1
fi

mkdir -p "${DEST}"

# 备份当前版本
if [ -f "${DEST}/index.html" ]; then
  echo "[deploy] >>> 备份当前版本 → ${BACKUP_PATH}"
  tar -czf "${BACKUP_PATH}" -C "${DEST}" . 2>/dev/null || echo "[deploy] WARN: 备份失败（继续部署）"
fi

# 清空并解压新包
echo "[deploy] >>> 清空并解压新包..."
find "${DEST}" -mindepth 1 -delete 2>/dev/null || true
if command -v unzip >/dev/null 2>&1; then
  unzip -oq "${ZIP_SRC}" -d "${DEST}"
else
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${ZIP_SRC}" "${DEST}"
fi
rm -f "${ZIP_SRC}"
echo "[deploy] 解压完成"

# reload nginx
echo "[deploy] >>> reload nginx..."
if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
  if sudo -n systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null; then
    echo "[deploy] nginx 已 reload"
  else
    echo "[deploy] WARN: nginx reload 失败，请手动执行：sudo systemctl reload nginx" >&2
  fi
else
  echo "[deploy] 未检测到 nginx 或配置测试失败，跳过 reload"
fi

echo "[deploy] 回滚方式（如需）：tar -xzf ${BACKUP_PATH} -C ${DEST} 后 reload nginx"
REMOTE_SCRIPT

echo ""
echo "============================================"
echo "  前端部署完成！"
echo "============================================"
