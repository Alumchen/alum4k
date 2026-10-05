#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-alum4k}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-5174}"
WEB_PORT="${WEB_PORT:-80}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}.conf"

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

if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit .env after deployment if you need TMDB/AList credentials."
fi

if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi

npm run build

NPM_BIN="$(command -v npm)"

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

${SUDO} systemctl daemon-reload
${SUDO} systemctl enable --now "${APP_NAME}"

${SUDO} tee "${NGINX_AVAILABLE}" >/dev/null <<EOF
server {
    listen ${WEB_PORT};
    server_name _;

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

${SUDO} ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
${SUDO} nginx -t
${SUDO} systemctl reload nginx

echo "Alum4K deployed."
echo "Web: http://localhost:${WEB_PORT}"
echo "API health: http://localhost:${WEB_PORT}/api/health"
echo "Service logs: ${SUDO} journalctl -u ${APP_NAME} -f"
