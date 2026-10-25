import type { Express, Request, Response, RequestHandler } from "express";
import crypto from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { requireAuth, userFromRequest, type AuthenticatedRequest, type PublicUser } from "./auth";
import { AiError, aiOwner, aiRuntime, canUseAi, loadAi } from "./ai";
import { pluginEnabled } from "./workbench";
import { changeChats, findChat, loadChats } from "./ai-chat-store";
import { waitChatGptReady, sendChatGpt, WebRelayError, conversationUrl } from "./chatgpt-web";
import { supportsWebRelay, type AiChat, type StoredAiChat } from "../shared/ai-chat";
import { captureAiReply } from "./ai-presentation";
import { decodeAiImages, readAiImage, removeAiImages, saveAiImage } from "./ai-assets";

type Job = { chatId: string; requestId: string; text: string; submitted: boolean; abort: AbortController };
const jobs = new Map<string, Job>();
const browsers = new Map<string, { id: string; port: number; browser: Browser }>();
export function cancelAiRelays(username?: string) { for (const [name, job] of jobs) if (!username || name === username) job.abort.abort(); }
function publicChat(chat: StoredAiChat, username: string): AiChat {
  const { remoteUrl: _url, ...safe } = chat; const job = jobs.get(username);
  return { ...safe, messages: safe.messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "pending") return message;
    return job?.requestId === message.requestId ? { ...message, text: job.text, submitted: job.submitted } : { ...message, status: "error", code: "INTERRUPTED", error: "服务已重启或连接任务已结束；问题可能已提交，不会自动重发。" };
  }) };
}
async function toolFor(user: PublicUser, id: string) {
  if (!await pluginEnabled("alumai")) throw new AiError("AlumAI 模块暂未启用。", 503);
  const store = await loadAi(); if (!canUseAi(store, user)) throw new AiError("此账号未获准使用个人 AI 工作空间。", 403);
  const tool = store.tools.find((tool) => tool.id === id && tool.enabled); if (!tool) throw new AiError("AI 工具不存在或已停用。", 404);
  if (!supportsWebRelay(tool)) throw new AiError("此工具尚未适配文字中转，目前仅支持 ChatGPT 官网入口。", 400);
  return tool;
}
async function relayBrowser(user: PublicUser, target: string): Promise<{ page: Page; touch: () => Promise<void> }> {
  const health = await aiRuntime<{ ready: boolean; relayVersion?: number }>("/health");
  if (!health.ready || health.relayVersion !== 1) throw new WebRelayError("UPGRADE_RUNTIME", "文字中转组件未就绪，请管理员重新运行 AlumAI 安装脚本。");
  const owner = aiOwner(user.username); const remote = await aiRuntime<{ id: string; cdpPort: number }>("/ensure", "POST", { owner, target });
  if (!remote || !/^[\w-]{1,100}$/.test(remote.id) || !Number.isInteger(remote.cdpPort) || remote.cdpPort < 1024 || remote.cdpPort > 65535) throw new WebRelayError("UPGRADE_RUNTIME", "浏览器组件缺少文字连接能力，请重新运行安装脚本。");
  let connection = browsers.get(owner);
  if (!connection || !connection.browser.isConnected() || connection.id !== remote.id || connection.port !== remote.cdpPort) {
    let info: { webSocketDebuggerUrl: string } | undefined;
    for (let attempt = 0; attempt < 20; attempt++) { try { const response = await fetch(`http://127.0.0.1:${remote.cdpPort}/json/version`, { redirect: "error", signal: AbortSignal.timeout(1000) }); if (response.ok) { info = await response.json(); break; } } catch {} await new Promise(resolve=>setTimeout(resolve,300)); }
    if (!info) throw new WebRelayError("BROWSER_UNAVAILABLE", "个人浏览器尚未准备好，请检查连接后再提问。");
    const path = new URL(info.webSocketDebuggerUrl).pathname; if (!/^\/devtools\/browser\/[\w-]+$/.test(path)) throw new WebRelayError("UPGRADE_RUNTIME", "浏览器文字连接地址无效。");
    const browser = await chromium.connectOverCDP(`ws://127.0.0.1:${remote.cdpPort}${path}`, { timeout: 10000 });
    connection = { id: remote.id, port: remote.cdpPort, browser }; browsers.set(owner, connection);
    browser.on("disconnected", () => { if (browsers.get(owner)?.browser === browser) browsers.delete(owner); });
  }
  const context = connection.browser.contexts()[0]; if (!context) throw new WebRelayError("BROWSER_UNAVAILABLE", "个人浏览器会话不可用。");
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  return { page, touch: async () => { await aiRuntime("/touch", "POST", { owner, id: remote.id }); } };
}
async function readyPage(page: Page, url: string, signal?: AbortSignal) {
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 }); }
  catch (error) { if (!(error instanceof Error) || error.name !== "TimeoutError") throw new WebRelayError("PAGE_UNAVAILABLE", "服务器未能打开 ChatGPT 网页，请检查服务器网络或账号窗口；本次问题未发送。"); }
  return waitChatGptReady(page, { signal });
}
async function runJob(user: PublicUser, auth: string, job: Job) {
  let page: Page | undefined; let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const chat = findChat(await loadChats(user.username), job.chatId); const tool = await toolFor(user, chat.toolId);
    if (job.abort.signal.aborted) throw new WebRelayError("CANCELLED", "已取消。");
    const priorReplies = chat.messages.filter(message=>message.role === "assistant" && message.requestId !== job.requestId);
    if (!chat.remoteUrl && priorReplies.some(message=>message.submitted || message.status === "complete")) throw new WebRelayError("CONTEXT_UNAVAILABLE", "无法恢复此网页会话，请新建对话，旧问题不会重新发送。");
    const remote = await relayBrowser(user, tool.url); page = remote.page;
    timer = setInterval(() => { void (async () => { const current = await userFromRequest({ headers: { authorization: auth }, query: {} } as Request); if (!current) throw new Error("Expired"); await toolFor(current, chat.toolId); await remote.touch(); })().catch(() => job.abort.abort()); }, 15000);
    const ready = await readyPage(page, chat.remoteUrl || tool.url, job.abort.signal); if (!ready.ready) throw new WebRelayError(ready.code, ready.message);
    const input = chat.messages.find((message) => message.requestId === job.requestId && message.role === "user")!;
    const prompt = input.text;
    const images = await Promise.all((input.images || []).map(async image => ({ name: image.name, mimeType: image.mime, buffer: await readAiImage(user.username, chat.id, image.id) })));
    const reply = await sendChatGpt(page, prompt, {
      signal: job.abort.signal, images, onText: (text) => { job.text = text; },
      onSubmitted: async (url) => { job.submitted = true; await changeChats(user.username, (items) => { const stored = findChat(items, chat.id); const message = stored.messages.find((message) => message.requestId === job.requestId && message.role === "assistant")!; message.submitted = true; if (url) stored.remoteUrl = url; }); }
    });
    const beforeCapture = conversationUrl(page.url());
    const presentation = await captureAiReply(page.locator('[data-message-author-role="assistant"]').last(), user.username, chat.id);
    if (conversationUrl(page.url()) !== beforeCapture) throw new WebRelayError("CONVERSATION_CHANGED", "保存图文时网页会话发生变化，已停止。");
    if (job.abort.signal.aborted) throw new WebRelayError("CANCELLED", "已停止。");
    await changeChats(user.username, (items) => { const chat = findChat(items, job.chatId); const message = chat.messages.find((message) => message.role === "assistant" && message.requestId === job.requestId)!; message.text = reply.text; message.presentation = presentation; message.status = "complete"; chat.updatedAt = new Date().toISOString(); if (reply.remoteUrl) chat.remoteUrl = reply.remoteUrl; });
  } catch (error) {
    const code = job.abort.signal.aborted ? "CANCELLED" : error instanceof WebRelayError ? error.code : "RELAY_UNAVAILABLE";
    const detail = error instanceof WebRelayError || error instanceof AiError ? error.message : "图文中转连接失败，请检查服务器浏览器。";
    const message = code === "CANCELLED" ? "已停止。已提交的问题不会自动重发。" : detail + (job.submitted ? " 问题可能已提交，不会自动重发。" : " 问题尚未提交。");
    await changeChats(user.username, (items) => { const chat = findChat(items, job.chatId); const result = chat.messages.find((item) => item.role === "assistant" && item.requestId === job.requestId)!; Object.assign(result, { status: code === "CANCELLED" ? "cancelled" : "error", text: job.text, code, error: message, submitted: job.submitted }); chat.updatedAt = new Date().toISOString(); }).catch(() => undefined);
  } finally { if (timer) clearInterval(timer); await page?.close().catch(() => undefined); if (jobs.get(user.username) === job) jobs.delete(user.username); }
}
export function addAiRelayRoutes(app: Express) {
  const route = (handler: (request: AuthenticatedRequest, response: Response) => Promise<unknown>): RequestHandler => (request, response, next) => { handler(request, response).catch((error) => { if (error instanceof AiError || error instanceof WebRelayError) response.status(error instanceof AiError ? error.status : 503).json({ message: error.message, ...(error instanceof WebRelayError ? { code: error.code } : {}) }); else next(error); }); };
  app.post("/api/ai/relay/connect", requireAuth, route(async (request, response) => {
    const tool = await toolFor(request.user!, request.body?.toolId); if (jobs.has(request.user!.username)) throw new AiError("当前对话正在处理中，请稍后检查连接。", 409);
    const remote = await relayBrowser(request.user!, tool.url); try { response.json(await readyPage(remote.page, tool.url)); } finally { await remote.page.close().catch(() => undefined); }
  }));
  app.use("/api/ai/chats", requireAuth, async (request: AuthenticatedRequest, response, next) => { try { if (!await pluginEnabled("alumai") || !canUseAi(await loadAi(), request.user)) { response.status(403).json({ message: "此账号未获准使用 AI 工作空间。" }); return; } next(); } catch (error) { next(error); } });
  // Each chat read and write is scoped to the authenticated owner, never a supplied username.
  app.get("/api/ai/chats", requireAuth, route(async (request, response) => { const chats = await loadChats(request.user!.username); response.json({ items: chats.map((chat) => ({ id: chat.id, title: chat.title, toolId: chat.toolId, updatedAt: chat.updatedAt })).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) }); }));
  app.post("/api/ai/chats", requireAuth, route(async (request, response) => { const user = request.user!; const tool = await toolFor(user, request.body?.toolId); const chat = await changeChats(user.username, (items) => { if (items.length >= 50) throw new AiError("对话数量达到50个，请先删除不需要的本地对话。"); const now = new Date().toISOString(); const chat: StoredAiChat = { id: crypto.randomUUID(), toolId: tool.id, title: "新对话", createdAt: now, updatedAt: now, messages: [] }; items.unshift(chat); return chat; }); response.status(201).json({ item: publicChat(chat, user.username) }); }));
  app.get("/api/ai/chats/:id", requireAuth, route(async (request, response) => { response.json({ item: publicChat(findChat(await loadChats(request.user!.username), request.params.id), request.user!.username) }); }));
  app.get("/api/ai/chats/:id/images/:image", requireAuth, route(async (request, response) => {
    const chat = findChat(await loadChats(request.user!.username), request.params.id);
    const images = chat.messages.flatMap(message => [...(message.images || []), ...(message.presentation?.images || []), ...(message.presentation?.snapshot ? [message.presentation.snapshot] : [])]);
    const image = images.find(image => image.id === request.params.image); if (!image) throw new AiError("图片不存在。", 404);
    response.set({ "Content-Type": image.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'", "Content-Disposition": "inline" }).send(await readAiImage(request.user!.username, chat.id, image.id));
  }));
  app.delete("/api/ai/chats/:id", requireAuth, route(async (request, response) => { if (jobs.get(request.user!.username)?.chatId === request.params.id) throw new AiError("请先停止当前回复，再删除本地对话。", 409); await changeChats(request.user!.username, (items) => { const chat = findChat(items, request.params.id); items.splice(items.indexOf(chat), 1); }); await removeAiImages(request.user!.username, request.params.id); response.json({ ok: true }); }));
  app.post("/api/ai/chats/:id/messages", requireAuth, route(async (request, response) => {
    const user = request.user!; const prompt = request.body?.text; const requestId = request.body?.requestId;
    const uploads = decodeAiImages(request.body?.images);
    const inputDigest = crypto.createHash("sha256").update(JSON.stringify(uploads.map(({input,bytes})=>[input.name,input.mime,crypto.createHash("sha256").update(bytes).digest("hex")]))).digest("hex");
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 8000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(prompt) || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) throw new AiError("问题需为1到8000字，并带有效请求标识。");
    const chats = await loadChats(user.username); const chat = findChat(chats, request.params.id); await toolFor(user, chat.toolId);
    const existing = chats.flatMap((chat) => chat.messages).find((message) => message.requestId === requestId && message.role === "user");
    if (existing) { if (existing.text !== prompt || (existing.inputDigest ? existing.inputDigest !== inputDigest : uploads.length > 0) || !chat.messages.some((message) => message.id === existing.id)) throw new AiError("请求标识已用于其他问题或图片。", 409); response.json({ item: publicChat(chat, user.username) }); return; }
    if (jobs.has(user.username)) throw new AiError("一个个人网页账号同时只能处理一个问题。", 409);
    if (chat.messages.length >= 100 || chats.flatMap((chat) => chat.messages).reduce((sum, message) => sum + message.text.length, 0) + prompt.length + 60000 > 2000000) throw new AiError("本地对话容量已满，请清理后再提问。");
    const job: Job = { chatId: chat.id, requestId, text: "", submitted: false, abort: new AbortController() }; jobs.set(user.username, job);
    try { const images = await Promise.all(uploads.map(({ input, bytes }) => saveAiImage(user.username, chat.id, bytes, input.name, input.mime))); await changeChats(user.username, (items) => { const stored = findChat(items, chat.id); const now = new Date().toISOString(); if (!stored.messages.length) stored.title = prompt.replace(/\s+/g," ").trim().slice(0,50); stored.updatedAt = now; stored.messages.push({ id: crypto.randomUUID(), requestId, role: "user", text: prompt, images, inputDigest, status: "complete", createdAt: now }, { id: crypto.randomUUID(), requestId, role: "assistant", text: "", status: "pending", createdAt: now }); }); } catch (error) { jobs.delete(user.username); throw error; }
    void runJob(user, request.headers.authorization!, job);
    response.status(202).json({ item: publicChat(findChat(await loadChats(user.username), chat.id), user.username) });
  }));
  app.post("/api/ai/chats/:id/cancel", requireAuth, route(async (request, response) => { findChat(await loadChats(request.user!.username), request.params.id); const job = jobs.get(request.user!.username); if (job?.chatId === request.params.id) job.abort.abort(); response.json({ ok: true }); }));
}
