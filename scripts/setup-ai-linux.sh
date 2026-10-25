#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ "${EUID}" -ne 0 ]]; then echo "Run with sudo: sudo bash scripts/setup-ai-linux.sh"; exit 1; fi
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${APP_NAME:-alum4k}"
if [[ ! "${APP_NAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then echo "Invalid APP_NAME"; exit 1; fi
if [[ "${APP_DIR}" == *$'\n'* || "${APP_DIR}" == *'"'* ]]; then echo "Unsupported application path."; exit 1; fi
AVAILABLE_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
if (( AVAILABLE_KB < 3500000 )); then echo "AlumAI requires a server with at least 4 GB RAM. Increase server memory before installing."; exit 1; fi
command -v systemctl >/dev/null || { echo "systemd is required."; exit 1; }
NODE_BIN="$(command -v node)"
[[ -f "${APP_DIR}/.env" ]] || { echo "Deploy the main website first."; exit 1; }
if ! command -v docker >/dev/null; then
  command -v apt-get >/dev/null || { echo "Install Docker Engine first."; exit 1; }
  apt-get update
  apt-get install -y docker.io
fi
systemctl enable --now docker
docker info >/dev/null
cd "${APP_DIR}"
echo "Building the personal browser image. This can take several minutes."
docker build --build-arg "BASE_IMAGE=${ALUMAI_BASE_IMAGE:-selenium/standalone-chromium:155.0-chromedriver-155.0-grid-4.50.0-20261010}" -t alumai-browser:1 plugins/alumai
install -d -m 700 /etc/alumai /opt/alumai-runtime
install -m 600 scripts/ai-runtime.mjs /opt/alumai-runtime/ai-runtime.mjs
if [[ ! -f /etc/alumai/runtime.env ]]; then
  "${NODE_BIN}" --input-type=module - <<'NODE'
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
writeFileSync("/etc/alumai/runtime.env", `ALUMAI_RUNTIME_TOKEN=${randomBytes(32).toString("hex")}\nALUMAI_RUNTIME_PORT=5188\nALUMAI_MAX_BROWSERS=1\n`, { mode: 0o600 });
NODE
fi
chmod 600 /etc/alumai/runtime.env
BACKUP_DIR="${APP_DIR}/backups/alumai-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "${BACKUP_DIR}"
cp -a .env "${BACKUP_DIR}/.env"
"${NODE_BIN}" --input-type=module - <<'NODE'
import { readFileSync, writeFileSync, renameSync, statSync, chownSync, chmodSync } from "node:fs";
const source = readFileSync("/etc/alumai/runtime.env", "utf8");
const token = /^ALUMAI_RUNTIME_TOKEN=([a-f0-9]{64})$/m.exec(source)?.[1];
if (!token) throw new Error("Runtime token is invalid.");
const port = Number(/^ALUMAI_RUNTIME_PORT=(\d+)$/m.exec(source)?.[1] || 5188);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid runtime port.");
let data = readFileSync(".env", "utf8");
for (const [key, value] of [["AI_RUNTIME_URL", `http://127.0.0.1:${port}`], ["AI_RUNTIME_TOKEN", token]]) {
  const pattern = new RegExp(`^(?:export\\s+)?${key}=.*$`, "gm");
  data = pattern.test(data) ? data.replace(pattern, `${key}=${value}`) : data.trimEnd() + `\n${key}=${value}\n`;
}
const original = statSync(".env"); const temporary = ".env.alumai.tmp";
writeFileSync(temporary, data, { mode: 0o600 }); chownSync(temporary, original.uid, original.gid); chmodSync(temporary, 0o600); renameSync(temporary, ".env");
NODE
cat > /etc/systemd/system/alumai-runtime.service <<EOF
[Unit]
Description=AlumAI Personal Browser Runtime
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
EnvironmentFile=/etc/alumai/runtime.env
Environment=DOCKER_HOST=unix:///var/run/docker.sock
ExecStart=${NODE_BIN} /opt/alumai-runtime/ai-runtime.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now alumai-runtime
systemctl restart alumai-runtime
"${NODE_BIN}" --input-type=module - <<'NODE'
import { readFileSync } from "node:fs";
const config = readFileSync("/etc/alumai/runtime.env", "utf8");
const token = /^ALUMAI_RUNTIME_TOKEN=([a-f0-9]{64})$/m.exec(config)?.[1];
const port = Number(/^ALUMAI_RUNTIME_PORT=(\d+)$/m.exec(config)?.[1] || 5188);
let ready = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try { const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) }); if (response.ok && (await response.json()).ready) { ready = true; break; } } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error("AlumAI runtime is not ready. Check: sudo journalctl -u alumai-runtime -n 80 --no-pager");
NODE
systemctl restart "${APP_NAME}"
echo "AlumAI runtime installed. Open /ai/admin to check runtime status."
echo "No extra public ports are required. Keep 5188, 5900, 7900 and 4444 closed in the cloud firewall."
echo "Login profiles stay in Docker volumes named alumai-profile-*. Keep these private."
echo "Runtime logs: sudo journalctl -u alumai-runtime -n 80 --no-pager"
