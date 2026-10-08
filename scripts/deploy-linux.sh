#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-alum4k}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-5174}"
WEB_PORT="${WEB_PORT:-80}"
SERVER_NAME="${SERVER_NAME:-_}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}.conf"

if [[ ! "${APP_NAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "APP_NAME may only contain letters, numbers, underscores and hyphens."
  exit 1
fi
for port in "${API_PORT}" "${WEB_PORT}"; do
  if [[ ! "${port}" =~ ^[0-9]+$ ]] || (( 10#${port} < 1 || 10#${port} > 65535 )); then
    echo "Ports must be integers between 1 and 65535."
    exit 1
  fi
done

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

need_cmd node
need_cmd npm

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js 20+ is required. Current version: $(node -v)"
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required for one-click service deployment."
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    ${SUDO} apt-get update
    ${SUDO} apt-get install -y nginx
  else
    echo "Nginx is required. Install nginx first, then rerun this script."
    exit 1
  fi
fi

cd "${APP_DIR}"

if [[ "${UPDATE_ONLY:-0}" == "1" && ( ! -f "${SERVICE_FILE}" || ! -f "${NGINX_AVAILABLE}" ) ]]; then
  echo "No existing deployment found. Run scripts/deploy-linux.sh first."
  exit 1
fi

BACKUP_DIR="${APP_DIR}/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
umask 077
mkdir -p "${BACKUP_DIR}"
for file in .env data dist; do
  if [[ -e "${file}" ]]; then
    cp -a "${file}" "${BACKUP_DIR}/"
  fi
done
for file in "${SERVICE_FILE}" "${NGINX_AVAILABLE}"; do
  if [[ -f "${file}" ]]; then
    ${SUDO} cp -a "${file}" "${BACKUP_DIR}/"
  fi
done
echo "Backup: ${BACKUP_DIR}"

if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Configure TMDB credentials and change the admin password and auth secret before public access."
fi

if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi

if ! npm run build; then
  if [[ -d "${BACKUP_DIR}/dist" ]]; then
    mkdir -p dist
    cp -a "${BACKUP_DIR}/dist/." dist/
  fi
  echo "Build failed. Existing service and Nginx configuration were not changed."
  exit 1
fi

umask 022
chmod -R a+rX dist

NPM_BIN="$(command -v npm)"

if [[ ! -f "${SERVICE_FILE}" ]]; then
  ${SUDO} tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=Alum4K API Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=API_PORT=${API_PORT}
ExecStart=${NPM_BIN} run serve:api
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
else
  echo "Keeping existing systemd service: ${SERVICE_FILE}"
fi

${SUDO} systemctl daemon-reload
${SUDO} systemctl enable "${APP_NAME}"

if [[ ! -f "${NGINX_AVAILABLE}" ]]; then
  ${SUDO} tee "${NGINX_AVAILABLE}" >/dev/null <<EOF
server {
    listen ${WEB_PORT};
    server_name ${SERVER_NAME};

    root ${APP_DIR}/dist;
    index index.html;
    client_max_body_size 100m;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Range \$http_range;
        proxy_set_header If-Range \$http_if_range;
        proxy_buffering off;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
else
  echo "Keeping existing Nginx configuration, including domains, ports and HTTPS."
fi

if [[ ! -e "${NGINX_ENABLED}" && ! -L "${NGINX_ENABLED}" ]]; then
  ${SUDO} ln -s "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
fi
if ! ${SUDO} node scripts/public-pages.mjs "${NGINX_AVAILABLE}" "${API_PORT}" || ! ${SUDO} nginx -t; then
  if [[ -f "${BACKUP_DIR}/${APP_NAME}.conf" ]]; then
    ${SUDO} cp -a "${BACKUP_DIR}/${APP_NAME}.conf" "${NGINX_AVAILABLE}"
  fi
  if [[ -d "${BACKUP_DIR}/dist" ]]; then
    cp -a "${BACKUP_DIR}/dist/." dist/
  fi
  echo "Public-route configuration failed. Previous configuration and frontend restored; services were not restarted."
  exit 1
fi
${SUDO} systemctl restart "${APP_NAME}"
${SUDO} systemctl reload nginx

echo "Alum4K deployed."
echo "Configured listeners:"
${SUDO} awk '/^[[:space:]]*(listen|server_name)[[:space:]]/ {print "  " $0}' "${NGINX_AVAILABLE}"
echo "API health: http://127.0.0.1:${API_PORT}/api/health"
echo "Backup: ${BACKUP_DIR}"
echo "Service logs: ${SUDO} journalctl -u ${APP_NAME} -f"
