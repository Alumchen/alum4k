import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { aiTarget, type AiStore, type AiTool } from "../shared/ai";
import { listUsers, type PublicUser } from "./auth";

const file = path.resolve(process.cwd(), "data/ai/settings.json");
let pending: Promise<unknown> = Promise.resolve();
export class AiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const defaults: AiStore = { revision: 0, settings: { name: "AlumAI", description: "基于本人网页账号的图文问答工作空间", notice: "仅使用你本人的网页账号。登录资料保存在服务器个人浏览器中；对话记录按网站账号私有保存。", allowedUsers: [] }, tools: [
  { id: "chatgpt", name: "ChatGPT", description: "OpenAI 对话与创作", url: "https://chatgpt.com/", enabled: true, order: 0 },
  { id: "claude", name: "Claude", description: "Anthropic AI 助手", url: "https://claude.ai/", enabled: true, order: 1 },
  { id: "gemini", name: "Gemini", description: "Google AI 助手", url: "https://gemini.google.com/", enabled: true, order: 2 },
  { id: "deepseek", name: "DeepSeek", description: "DeepSeek 对话助手", url: "https://chat.deepseek.com/", enabled: true, order: 3 }
] };
function text(value: unknown, max: number, required = false) { if (typeof value !== "string" || value.length > max || /[\x00-\x1f]/.test(value) || required && !value.trim()) throw new AiError("字段为空、格式不正确或超出长度限制。"); return value.trim(); }
function checkedTarget(value: unknown) { try { return aiTarget(value); } catch { throw new AiError("只允许公开的 HTTPS 网站，不允许内网地址或带密码的地址。"); } }
function validate(raw: AiStore): AiStore {
  if (!raw || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !raw.settings || !Array.isArray(raw.settings.allowedUsers) || raw.settings.allowedUsers.length > 50 || !Array.isArray(raw.tools) || raw.tools.length > 50) throw new AiError("AI 插件配置不正确。");
  const ids = new Set<string>();
  const tools = raw.tools.map((tool) => { if (!tool || typeof tool.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(tool.id) || ids.has(tool.id) || typeof tool.enabled !== "boolean" || !Number.isInteger(tool.order) || tool.order < 0 || tool.order > 999) throw new AiError("工具 ID、顺序或启用状态不正确。"); ids.add(tool.id); return { id: tool.id, name: text(tool.name, 40, true), description: text(tool.description, 200), url: checkedTarget(tool.url), enabled: tool.enabled, order: tool.order }; });
  const allowedUsers = [...new Set(raw.settings.allowedUsers.map((name) => { const value = text(name, 20, true).toLowerCase(); if (!/^[a-z0-9_\u4e00-\u9fa5]{3,20}$/i.test(value)) throw new AiError("授信用户名格式不正确。"); return value; }))];
  if (typeof raw.settings.notice !== "string" || raw.settings.notice.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw.settings.notice)) throw new AiError("使用说明格式不正确。");
  return { revision: raw.revision, settings: { name: text(raw.settings.name, 40, true), description: text(raw.settings.description, 200), notice: raw.settings.notice, allowedUsers }, tools };
}
export async function loadAi(): Promise<AiStore> { try { return validate(JSON.parse(await readFile(file, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaults); throw error; } }
function mutate(change: (store: AiStore) => void, revision: unknown) { const next = pending.then(async () => { const store = await loadAi(); if (revision !== store.revision) throw new AiError("配置已更新，请重新载入后再保存。", 409); change(store); const next = validate(store); next.revision++; await mkdir(path.dirname(file), { recursive: true }); try { await copyFile(file, file + ".bak"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } const tmp = file + "." + crypto.randomUUID() + ".tmp"; await writeFile(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 }); await rename(tmp, file); return next; }); pending = next.catch(() => undefined); return next; }
export function saveAiTool(input: AiTool, revision: unknown, id?: string) { return mutate((store) => { const index = id ? store.tools.findIndex((tool) => tool.id === id) : -1; if (id && index < 0) throw new AiError("工具不存在。", 404); const tool = { ...input, id: id || crypto.randomUUID() }; if (index < 0) store.tools.push(tool); else store.tools[index] = tool; }, revision); }
export function deleteAiTool(id: string, revision: unknown) { return mutate((store) => { if (!store.tools.some((tool) => tool.id === id)) throw new AiError("工具不存在。", 404); store.tools = store.tools.filter((tool) => tool.id !== id); }, revision); }
export async function saveAiSettings(settings: AiStore["settings"], revision: unknown) { const users = await listUsers(); if (!settings || !Array.isArray(settings.allowedUsers) || settings.allowedUsers.some((name) => typeof name !== "string" || !users.some((user) => user.username === name.trim().toLowerCase()))) throw new AiError("只能授权已存在的网站账号。"); return mutate((store) => { store.settings = settings; }, revision); }
export function canUseAi(store: AiStore, user?: PublicUser | null) { return !!user && (user.role === "admin" || store.settings.allowedUsers.includes(user.username)); }
export function aiOwner(username: string) { return crypto.createHash("sha256").update("alumai:" + username).digest("hex"); }
export async function aiRuntime<T>(endpoint: string, method = "GET", body?: unknown): Promise<T> {
  const token = process.env.AI_RUNTIME_TOKEN; if (!token || token.length < 32) throw new AiError("远程浏览器尚未安装，请管理员先运行 AlumAI 服务器安装脚本。", 503);
  const base = new URL(process.env.AI_RUNTIME_URL || "http://127.0.0.1:5188");
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new AiError("远程浏览器运行组件地址配置不正确。", 503);
  try { const response = await fetch(new URL(endpoint, base), { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(method === "POST" ? 90000 : 6000) }); if (!response.ok) { const result = await response.json().catch(() => ({})); throw new AiError(typeof result.message === "string" ? result.message : "远程浏览器操作失败。", response.status === 429 ? 429 : 503); } return await response.json() as T; }
  catch (error) { if (error instanceof AiError) throw error; throw new AiError("无法连接远程浏览器运行组件，请检查服务状态。", 503); }
}
