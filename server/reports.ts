import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { reportReasons, type ResourceReport } from "../shared/reports";
import { findMedia, markResourceInvalid } from "./library";
import type { PublicUser } from "./auth";

interface StoredReport extends ResourceReport { fingerprint: string; linkHash: string }
const file = path.resolve(process.cwd(), "data", "resource-reports.json");
let pending: Promise<unknown> = Promise.resolve();
async function load(): Promise<StoredReport[]> {
  try { const items = JSON.parse(await readFile(file, "utf8")); if (!Array.isArray(items)) throw new Error("反馈数据格式不正确。"); return items; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
function publicReport({ fingerprint: _fingerprint, linkHash: _linkHash, ...item }: StoredReport) { return item; }
function mutate<T>(action: (items: StoredReport[]) => Promise<T>) {
  const task = pending.then(async () => {
    const items = await load(); const result = await action(items);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await rename(temporary, file); return result;
  }); pending = task.catch(() => undefined); return task;
}
export async function listReports() { return (await load()).map(publicReport); }
export function submitReport(mediaId: string, resourceId: string, input: unknown, user: PublicUser | null, ip: string) {
  return mutate(async (items) => {
    const media = await findMedia(mediaId); const resource = media?.resources?.find((entry) => entry.id === resourceId);
    if (!media || !resource) throw new Error("资源不存在或已删除。");
    if (resource.access !== "free" && !user?.vip && user?.role !== "admin") throw new Error("此资源需要 VIP 权限才能反馈。");
    const raw = input as Partial<ResourceReport>;
    if (!reportReasons.includes(raw?.reason!)) throw new Error("请选择反馈原因。");
    const note = typeof raw.note === "string" ? raw.note.trim() : "";
    if (note.length > 500) throw new Error("反馈说明最多 500 字。");
    const fingerprint = crypto.createHmac("sha256", process.env.AUTH_SECRET || "alum4k-local-dev-secret").update(user ? `user:${user.username}` : `guest:${ip}`).digest("hex");
    if (items.some((item) => item.fingerprint === fingerprint && item.mediaId === mediaId && item.resourceId === resourceId && item.status === "pending")) throw new Error("已收到该资源的反馈，请勿重复提交。");
    if (items.filter((item) => item.fingerprint === fingerprint && Date.parse(item.createdAt) > Date.now() - 86400000).length >= 10) throw new Error("每天最多提交 10 条资源反馈。");
    const time = new Date().toISOString();
    const item: StoredReport = { id: crypto.randomUUID(), mediaId, mediaTitle: media.title, resourceId, resourceTitle: resource.title, reason: raw.reason!, note,
      reporter: user?.username || "游客", fingerprint, linkHash: crypto.createHash("sha256").update(resource.url).digest("hex"), status: "pending", reply: "", createdAt: time, updatedAt: time };
    items.unshift(item); return publicReport(item);
  });
}
export function updateReport(id: string, input: unknown) {
  return mutate(async (items) => {
    const item = items.find((entry) => entry.id === id); if (!item) throw new Error("反馈不存在。");
    const raw = input as Partial<ResourceReport> & { markInvalid?: boolean };
    if (!["pending", "resolved", "dismissed"].includes(raw?.status ?? "")) throw new Error("请选择有效处理状态。");
    const reply = typeof raw.reply === "string" ? raw.reply.trim() : ""; if (reply.length > 1000) throw new Error("处理说明最多 1000 字。");
    if (raw.markInvalid === true) {
      if (raw.status !== "resolved") throw new Error("标记失效时请选择已处理。");
      await markResourceInvalid(item.mediaId, item.resourceId, item.linkHash);
    }
    item.status = raw.status!; item.reply = reply; item.updatedAt = new Date().toISOString(); return publicReport(item);
  });
}
