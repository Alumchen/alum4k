import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import path from "node:path";

export function siteOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("网站地址需要 HTTPS 域名（本机测试允许 HTTP），不能含路径、密码或参数。");
  return url.origin;
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => undefined); }
}
export async function siteRequest(site, endpoint, { token, body, signal, fetcher = fetch } = {}) {
  const origin = siteOrigin(site);
  if (!["/api/auth/login", "/api/auth/me", "/api/admin/collector/import"].includes(endpoint)) throw new Error("Unsupported collector endpoint.");
  const response = await fetcher(origin + endpoint, {
    method: body ? "POST" : "GET", redirect: "error",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    const error = new Error(`网站请求失败（HTTP ${response.status}），未确认上传。`);
    error.status = response.status; throw error;
  }
  const text = await response.text();
  if (text.length > 100000) throw new Error("网站响应异常。");
  try { return JSON.parse(text); } catch { throw new Error("网站未返回有效 JSON，请确认已更新服务器和接口地址。"); }
}
export async function readSession(directory) {
  let session;
  try { session = JSON.parse(await readFile(path.join(directory, "site-session.json"), "utf8")); }
  catch { throw new Error("请先运行 npm run collect:115:login 登录网站管理员。"); }
  if (!session || typeof session.token !== "string" || session.token.length > 8192 || /[\s\x00-\x1f]/.test(session.token)) throw new Error("本地登录会话格式异常，请重新登录。");
  return { site: siteOrigin(session.site), token: session.token };
}
export async function confirmAdmin(session) {
  const result = await siteRequest(session.site, "/api/auth/me", { token: session.token });
  if (result.user?.role !== "admin") throw new Error("自动上传仅允许管理员账号。");
}
