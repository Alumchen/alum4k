import type { Express, Request, Response, RequestHandler } from "express";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import httpProxy from "http-proxy";
import { requireAdmin, requireAuth, userFromRequest, type AuthenticatedRequest } from "./auth";
import { pluginEnabled } from "./workbench";
import { escapeHtml, siteOrigin } from "./seo";
import { loadSettings } from "./settings";
import { AiError, loadAi, canUseAi, aiOwner, aiRuntime, saveAiTool, deleteAiTool, saveAiSettings } from "./ai";

type Ticket = { id: string; cookie: string; token: string; username: string; owner: string; runtimeId: string; port: number; expires: number; sockets: Set<Duplex> };
type RuntimeSession = { id: string; port: number };
const cookieName = "alumai_desktop";
export function addAiRoutes(app: Express) {
  const tickets = new Map<string, Ticket>();
  const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });
  function remove(id: string) { const ticket = tickets.get(id); if (ticket) { ticket.sockets.forEach((socket) => socket.destroy()); tickets.delete(id); } }
  function revoke(username?: string) { for (const ticket of tickets.values()) if (!username || ticket.username === username) remove(ticket.id); }
  const route = (handler: (request: AuthenticatedRequest, response: Response) => Promise<unknown>): RequestHandler => (request, response, next) => { handler(request, response).catch((error) => { if (error instanceof AiError) response.status(error.status).json({ message: error.message }); else if (error instanceof Error && error.name === "TypeError") response.status(400).json({ message: "请求字段或网站地址不正确。" }); else next(error); }); };
  async function allowed(request: AuthenticatedRequest) { if (!await pluginEnabled("alumai")) throw new AiError("AlumAI 模块暂未启用。", 503); const store = await loadAi(); if (!canUseAi(store, request.user)) throw new AiError("此个人远程浏览器仅对管理员及已授权的可信账号开放。", 403); return store; }
  function setCookie(response: Response, id: string, value: string, secure: boolean, clear = false) { response.append("Set-Cookie", `${cookieName}=${value}; Path=/ai/remote/${id}/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 28800}${secure ? "; Secure" : ""}`); }
  function bearer(request: Request) { const value = request.headers.authorization; if (!value?.startsWith("Bearer ")) throw new AiError("请重新登录。", 401); return value; }
  function runtimeSession(raw: RuntimeSession) { if (!raw || typeof raw.id !== "string" || !/^[\w-]{1,100}$/.test(raw.id) || !Number.isInteger(raw.port) || raw.port < 1024 || raw.port > 65535) throw new AiError("远程浏览器返回了无效的会话。", 503); return raw; }
  app.get("/api/ai", route(async (request, response) => { if (!await pluginEnabled("alumai")) throw new AiError("AlumAI 模块暂未启用。", 503); const store = await loadAi(); const user = await userFromRequest(request); let runtime: { ready: boolean; message?: string } = { ready: false }; if (canUseAi(store, user)) { try { runtime = await aiRuntime("/health"); } catch (error) { runtime.message = (error as Error).message; } } const { allowedUsers: _users, ...settings } = store.settings; response.json({ settings, tools: store.tools.filter((tool) => tool.enabled).sort((a, b) => a.order - b.order), canUse: canUseAi(store, user), runtime }); }));
  app.post("/api/ai/sessions", requireAuth, route(async (request, response) => {
    const store = await allowed(request); const tool = store.tools.find((tool) => tool.id === request.body?.toolId && tool.enabled); if (!tool) throw new AiError("工具不存在或已停用。", 404);
    const owner = aiOwner(request.user!.username); const runtime = runtimeSession(await aiRuntime<RuntimeSession>("/start", "POST", { owner, target: tool.url }));
    revoke(request.user!.username);
    const ticket: Ticket = { id: crypto.randomUUID(), cookie: crypto.randomBytes(32).toString("hex"), token: bearer(request), username: request.user!.username, owner, runtimeId: runtime.id, port: runtime.port, expires: Date.now() + 90000, sockets: new Set() };
    tickets.set(ticket.id, ticket); setCookie(response, ticket.id, ticket.cookie, request.secure);
    response.status(201).json({ id: ticket.id, websocketPath: `/ai/remote/${ticket.id}/websockify`, toolId: tool.id });
  }));
  app.post("/api/ai/sessions/:id/lease", requireAuth, route(async (request, response) => { await allowed(request); const ticket = tickets.get(request.params.id); if (!ticket || ticket.username !== request.user!.username || ticket.expires < Date.now()) throw new AiError("连接已过期，请重新打开浏览器。", 404); try { const runtime = runtimeSession(await aiRuntime<RuntimeSession>("/touch", "POST", { owner: ticket.owner, id: ticket.runtimeId })); if (runtime.port !== ticket.port || runtime.id !== ticket.runtimeId) throw new AiError("浏览器已重启，请重新连接。", 409); ticket.expires = Date.now() + 90000; ticket.token = bearer(request); response.json({ ok: true }); } catch (error) { remove(ticket.id); throw error; } }));
  app.delete("/api/ai/sessions", requireAuth, route(async (request, response) => { const owner = aiOwner(request.user!.username); revoke(request.user!.username); await aiRuntime("/stop", "POST", { owner }); response.json({ ok: true }); }));
  app.post("/api/ai/sessions/:id/clipboard", requireAuth, route(async (request, response) => { await allowed(request); const ticket = tickets.get(request.params.id); if (!ticket || ticket.username !== request.user!.username || ticket.expires < Date.now()) throw new AiError("连接已过期。", 404); const text = request.body?.text; if (typeof text !== "string" || text.length > 20000 || text.includes("\0")) throw new AiError("剪贴板文本格式不正确或超出20000字。"); await aiRuntime("/clipboard", "POST", { owner: ticket.owner, id: ticket.runtimeId, text }); response.json({ ok: true }); }));
  app.post("/api/ai/sessions/:id/clipboard/read", requireAuth, route(async (request, response) => { await allowed(request); const ticket = tickets.get(request.params.id); if (!ticket || ticket.username !== request.user!.username || ticket.expires < Date.now()) throw new AiError("连接已过期。", 404); const result = await aiRuntime<{ text: string }>("/clipboard/read", "POST", { owner: ticket.owner, id: ticket.runtimeId }); response.json({ text: typeof result.text === "string" ? result.text.slice(0,20000) : "" }); }));
  app.delete("/api/ai/profile", requireAuth, route(async (request, response) => { await allowed(request); if (request.body?.confirm !== "CLEAR") throw new AiError("请确认清除个人浏览器数据。"); revoke(request.user!.username); await aiRuntime("/clear", "POST", { owner: aiOwner(request.user!.username) }); response.json({ ok: true }); }));
  app.get("/api/admin/ai", requireAdmin, route(async (_request, response) => { response.json(await loadAi()); }));
  app.get("/api/admin/ai/runtime", requireAdmin, route(async (_request, response) => { try { response.json(await aiRuntime("/health")); } catch (error) { response.json({ ready: false, message: (error as Error).message }); } }));
  app.post("/api/admin/ai/tools", requireAdmin, route(async (request, response) => { response.status(201).json(await saveAiTool(request.body?.item, request.body?.revision)); revoke(); }));
  app.put("/api/admin/ai/tools/:id", requireAdmin, route(async (request, response) => { response.json(await saveAiTool(request.body?.item, request.body?.revision, request.params.id)); revoke(); }));
  app.delete("/api/admin/ai/tools/:id", requireAdmin, route(async (request, response) => { response.json(await deleteAiTool(request.params.id, request.body?.revision)); revoke(); }));
  app.put("/api/admin/ai/settings", requireAdmin, route(async (request, response) => { response.json(await saveAiSettings(request.body?.settings, request.body?.revision)); revoke(); }));
  app.get(["/ai", "/ai/", "/ai/admin", "/ai/admin/*"], route(async (request, response) => {
    const admin = /^\/ai\/admin(?:\/|$)/.test(request.path); const store = await loadAi(); response.setHeader("Cache-Control", "no-store");
    if (!admin && !await pluginEnabled("alumai")) { response.status(503).type("html").send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>模块暂未启用</title><h1>AlumAI 暂未启用</h1><a href="/">返回工作台</a></html>'); return; }
    const origin = siteOrigin(await loadSettings(), request); const head = `<!--alum4k:head:start--><title>${escapeHtml(store.settings.name)}${admin ? " · 管理后台" : " · 个人远程浏览器"}</title><meta name="description" content="${escapeHtml(store.settings.description)}"><meta name="robots" content="noindex, nofollow"><link rel="canonical" href="${escapeHtml(origin + (admin ? "/ai/admin" : "/ai"))}"><link rel="icon" href="/ai.svg"><!--alum4k:head:end-->`;
    const html = (await readFile(path.resolve(process.cwd(), "dist/index.html"), "utf8")).replace(/<!--alum4k:head:start-->[\s\S]*?<!--alum4k:head:end-->/, () => head).replace(/<!--alum4k:content:start-->[\s\S]*?<!--alum4k:content:end-->/, () => `<!--alum4k:content:start--><main class="seo-content"><h1>${escapeHtml(store.settings.name)}</h1><p>${escapeHtml(store.settings.description)}</p></main><!--alum4k:content:end-->`); response.type("html").send(html);
  }));
  app.use("/ai/remote", (_request, response) => { response.status(404).set("Cache-Control", "no-store").end(); });
  proxy.on("error", (_error, _request, socket) => { if ("destroy" in socket) socket.destroy(); });
  async function valid(ticket: Ticket) { const user = await userFromRequest({ headers: { authorization: ticket.token }, query: {} } as Request); return ticket.expires > Date.now() && user?.username === ticket.username && canUseAi(await loadAi(), user) && await pluginEnabled("alumai"); }
  const timer = setInterval(async () => { for (const ticket of tickets.values()) { try { if (!await valid(ticket)) remove(ticket.id); } catch { remove(ticket.id); } } }, 20000); timer.unref();
  return (server: Server) => {
    server.on("close", () => { clearInterval(timer); revoke(); proxy.close(); });
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!request.url?.startsWith("/ai/remote/")) return;
      const reject = () => { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); };
      void (async () => {
        const match = /^\/ai\/remote\/([a-f0-9-]{36})\/websockify$/.exec(request.url!); const ticket = match ? tickets.get(match[1]) : undefined;
        if (!ticket || !request.headers.origin) { reject(); return; }
        const origin = new URL(request.headers.origin); if (!/^https?:$/.test(origin.protocol) || origin.host !== request.headers.host) { reject(); return; }
        const cookies = (request.headers.cookie || "").split(";").map((entry) => entry.trim());
        if (ticket.sockets.size >= 2 || !cookies.includes(cookieName + "=" + ticket.cookie) || !await valid(ticket)) { reject(); return; }
        request.url = "/websockify"; delete request.headers.cookie; delete request.headers.authorization; delete request.headers["x-forwarded-for"];
        ticket.sockets.add(socket); socket.once("close", () => ticket.sockets.delete(socket));
        proxy.ws(request, socket, head, { target: `http://127.0.0.1:${ticket.port}` });
      })().catch(reject);
    });
  };
}
