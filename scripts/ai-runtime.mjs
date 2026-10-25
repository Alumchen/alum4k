import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { lookup } from "node:dns/promises";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
function pipeDockerInput(args, text) { return new Promise((resolve, reject) => { const child = spawn("docker", args, { stdio: ["pipe", "ignore", "ignore"], windowsHide: true }); const timeout = setTimeout(() => { child.kill(); reject(new Error("Clipboard operation timed out.")); }, 10000); child.on("error", reject); child.stdin.on("error", () => undefined); child.on("close", (code) => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error("Clipboard operation failed.")); }); child.stdin.end(text, "utf8"); }); }
export function validOwner(owner) { if (typeof owner !== "string" || !/^[a-f0-9]{64}$/.test(owner)) throw new Error("Invalid browser owner."); return owner; }
export function browserArgs(owner, image) {
  validOwner(owner);
  if (!/^[a-z0-9./:_-]{1,200}$/i.test(image) || image.startsWith("-")) throw new Error("Invalid browser image.");
  return ["run", "--detach", "--pull=never", "--name", "alumai-" + owner, "--label", "alumai.managed=1", "--label", "alumai.owner=" + owner, "--memory=2g", "--cpus=1.5", "--pids-limit=512", "--shm-size=512m", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--publish", "127.0.0.1::7900", "--publish", "127.0.0.1::9223", "--mount", `type=volume,source=alumai-profile-${owner},target=/home/seluser/.alumai`, "--env", "SE_VNC_NO_PASSWORD=true", "--env", "SE_SCREEN_WIDTH=1440", "--env", "SE_SCREEN_HEIGHT=900", "--env", "SE_SCREEN_DEPTH=24", image];
}
export async function publicTarget(raw, resolve = lookup) {
  if (typeof raw !== "string" || raw.length > 2000) throw new Error("Invalid target.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes(".") || /^\d+(\.\d+){3}$/.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error("Only public HTTPS websites are allowed.");
  const addresses = await resolve(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(({ address, family }) => { const [a,b,c,d] = address.split(".").map(Number); return family !== 4 || [a,b,c,d].some((n) => !Number.isInteger(n) || n < 0 || n > 255) || a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 172 && b >= 16 && b <= 31 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 && c === 113; })) throw new Error("The target does not resolve exclusively to public IPv4 addresses.");
  return url.href;
}
export class BrowserRuntime {
  sessions = new Map();
  pending = Promise.resolve();
  constructor({ run = (args) => exec("docker", args, { timeout: 35000, maxBuffer: 1024 * 1024, windowsHide: true }), input = pipeDockerInput, image = "alumai-browser:1", maximum = 1, idleMs = 15 * 60000, resolve = lookup } = {}) { this.run = run; this.input = input; this.image = image; this.maximum = maximum; this.idleMs = idleMs; this.resolve = resolve; }
  serial(fn) { const next = this.pending.then(fn); this.pending = next.catch(() => undefined); return next; }
  async health() { try { await this.run(["image", "inspect", this.image, "--format", "{{.Id}}"]); await this.run(["info", "--format", "{{.ServerVersion}}"]); return { ready: true, relayVersion: 1, active: this.sessions.size, maximum: this.maximum }; } catch { return { ready: false, active: this.sessions.size, maximum: this.maximum, message: "Docker 未就绪或 AlumAI 浏览器镜像尚未安装。" }; } }
  async cleanOrphans() { const result = await this.run(["ps", "-a", "--filter", "label=alumai.managed=1", "--format", "{{.Names}}"]); for (const name of result.stdout.trim().split(/\s+/).filter(Boolean)) { if (/^alumai-[a-f0-9]{64}$/.test(name)) await this.run(["rm", "--force", name]); } }
  async start(owner, target, navigate = true) {
    validOwner(owner); const url = await publicTarget(target, this.resolve);
    return this.serial(async () => {
      let session = this.sessions.get(owner);
      if (session) { if (navigate) await this.run(["exec", "--detach", "--user", "seluser", session.name, "/usr/bin/chromium", "--no-sandbox", "--user-data-dir=/home/seluser/.alumai/chrome", "--password-store=basic", "--new-tab", url]); session.touched = Date.now(); return session; }
      if (this.sessions.size >= this.maximum) throw new Error("浏览器名额已满，请稍后再试。");
      const name = "alumai-" + owner;
      try {
        await this.run(browserArgs(owner, this.image));
        const result = await this.run(["inspect", "--format", "{{json .NetworkSettings.Ports}}", name]);
        const bindings = JSON.parse(result.stdout)["7900/tcp"];
        if (!Array.isArray(bindings) || bindings.length !== 1 || bindings[0].HostIp !== "127.0.0.1" || !/^\d+$/.test(bindings[0].HostPort)) throw new Error("Invalid browser port binding.");
        const port = Number(bindings[0].HostPort); if (port < 1024 || port > 65535) throw new Error("Invalid browser port.");
        const debug = JSON.parse(result.stdout)["9223/tcp"];
        if (!Array.isArray(debug) || debug.length !== 1 || debug[0].HostIp !== "127.0.0.1" || !/^\d+$/.test(debug[0].HostPort)) throw new Error("Invalid relay port binding.");
        const cdpPort = Number(debug[0].HostPort); if (cdpPort < 1024 || cdpPort > 65535 || cdpPort === port) throw new Error("Invalid relay port.");
        let ready = false;
        for (let i = 0; i < 60; i++) { try { const response = await fetch(`http://127.0.0.1:${port}/vnc.html`, { signal: AbortSignal.timeout(1000), redirect: "error" }); await response.body?.cancel(); if (response.ok) { ready = true; break; } } catch {} await new Promise((resolve) => setTimeout(resolve, 500)); }
        if (!ready) throw new Error("Browser desktop timeout.");
        let displayReady = false;
        for (let i = 0; i < 30; i++) { try { await this.run(["exec", "--user", "seluser", name, "/usr/bin/xdpyinfo"]); displayReady = true; break; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); }
        if (!displayReady) throw new Error("Browser display timeout.");
        await this.run(["exec", "--user", "seluser", name, "rm", "-f", "/home/seluser/.alumai/chrome/SingletonLock", "/home/seluser/.alumai/chrome/SingletonCookie", "/home/seluser/.alumai/chrome/SingletonSocket"]);
        await this.run(["exec", "--detach", "--user", "seluser", name, "/usr/bin/chromium", "--no-sandbox", "--no-first-run", "--disable-dev-shm-usage", "--user-data-dir=/home/seluser/.alumai/chrome", "--password-store=basic", "--start-maximized", "--remote-debugging-port=9222", url]);
        let running = false;
        for (let i = 0; i < 20; i++) { try { await this.run(["exec", "--user", "seluser", name, "pgrep", "-x", "chromium"]); running = true; break; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); }
        if (!running) throw new Error("Chromium did not start.");
        await this.run(["exec", "--detach", "--user", "seluser", name, "/usr/bin/socat", "TCP-LISTEN:9223,reuseaddr,fork", "TCP:127.0.0.1:9222"]);
        session = { id: crypto.randomUUID(), owner, name, port, cdpPort, touched: Date.now() }; this.sessions.set(owner, session); return session;
      } catch { await this.run(["rm", "--force", name]).catch(() => undefined); throw new Error("浏览器启动失败，请管理员检查运行组件日志和服务器内存。"); }
    });
  }
  touch(owner, id) { validOwner(owner); const session = this.sessions.get(owner); if (!session || session.id !== id) throw new Error("远程浏览器已关闭，请重新打开。"); session.touched = Date.now(); return session; }
  async clipboard(owner, id, text) { const session = this.touch(owner, id); if (typeof text !== "string" || text.length > 20000 || text.includes("\0")) throw new Error("剪贴板文本格式不正确或超出20000字。"); await this.input(["exec", "--interactive", "--user", "seluser", session.name, "/usr/bin/xclip", "-selection", "clipboard", "-in"], text); return { ok: true }; }
  async readClipboard(owner, id) { const session = this.touch(owner, id); const result = await this.run(["exec", "--user", "seluser", session.name, "/usr/bin/xclip", "-selection", "clipboard", "-out"]); return { text: result.stdout.slice(0, 20000) }; }
  stop(owner, clear = false) { validOwner(owner); return this.serial(async () => { const session = this.sessions.get(owner); if (session) { await this.run(["exec", "--user", "seluser", session.name, "pkill", "-TERM", "-x", "chromium"]).catch(() => undefined); await this.run(["stop", "--time", "10", session.name]).catch(() => undefined); try { await this.run(["rm", "--force", session.name]); } finally { this.sessions.delete(owner); } } if (clear) await this.run(["volume", "rm", "--force", "alumai-profile-" + owner]); }); }
  async expire() { for (const session of this.sessions.values()) if (Date.now() - session.touched > this.idleMs) await this.stop(session.owner); }
}
export function createRuntimeServer(runtime, token) {
  if (typeof token !== "string" || token.length < 32) throw new Error("Runtime token is missing.");
  return http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store");
    const auth = Buffer.from(request.headers.authorization || ""); const expected = Buffer.from("Bearer " + token);
    if (auth.length !== expected.length || !crypto.timingSafeEqual(auth, expected)) { response.writeHead(401).end('{"message":"Unauthorized"}'); return; }
    try {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      if (request.method === "GET" && pathname === "/health") { response.end(JSON.stringify(await runtime.health())); return; }
      if (request.method !== "POST" || !["/start", "/ensure", "/touch", "/stop", "/clear", "/clipboard", "/clipboard/read"].includes(pathname)) { response.writeHead(404).end('{"message":"Not found"}'); return; }
      let raw = ""; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 131072) throw new Error("Request too large."); }
      const body = JSON.parse(raw); validOwner(body.owner);
      const result = pathname === "/clipboard" ? await runtime.clipboard(body.owner, body.id, body.text) : pathname === "/clipboard/read" ? await runtime.readClipboard(body.owner, body.id) : (pathname === "/start" || pathname === "/ensure") ? await runtime.start(body.owner, body.target, pathname === "/start") : pathname === "/touch" ? runtime.touch(body.owner, body.id) : await runtime.stop(body.owner, pathname === "/clear");
      response.end(JSON.stringify(pathname.startsWith("/clipboard") ? result : result ? { id: result.id, port: result.port, cdpPort: result.cdpPort } : { ok: true }));
    } catch (error) { response.writeHead(503).end(JSON.stringify({ message: error instanceof Error ? error.message : "Browser operation failed." })); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const maximum = Number(process.env.ALUMAI_MAX_BROWSERS || 1); const port = Number(process.env.ALUMAI_RUNTIME_PORT || 5188);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10 || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid runtime limits.");
  const runtime = new BrowserRuntime({ maximum, image: process.env.ALUMAI_BROWSER_IMAGE || "alumai-browser:1" });
  await runtime.cleanOrphans();
  const server = createRuntimeServer(runtime, process.env.ALUMAI_RUNTIME_TOKEN); server.requestTimeout = 100000;
  server.listen(port, "127.0.0.1", () => console.log("AlumAI runtime listening on loopback."));
  setInterval(() => runtime.expire().catch(() => console.error("Browser cleanup failed.")), 60000).unref();
}
