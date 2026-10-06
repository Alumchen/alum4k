import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { requestStatuses, type FilmRequest } from "../shared/community";

const file = path.resolve(process.cwd(), "data", "requests.json");
let pending: Promise<unknown> = Promise.resolve();
async function load(): Promise<FilmRequest[]> {
  try { const items = JSON.parse(await readFile(file, "utf-8")); if (!Array.isArray(items)) throw new Error("求片数据格式不正确。"); return items; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
function mutate<T>(update: (items: FilmRequest[]) => T) {
  const task = pending.then(async () => {
    const items = await load(); const result = update(items);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
    await rename(temporary, file); return result;
  });
  pending = task.catch(() => undefined); return task;
}
export async function listFilmRequests(username?: string) { const items = await load(); return username ? items.filter((item) => item.username === username) : items; }
export function submitFilmRequest(username: string, input: unknown) {
  return mutate((items) => {
    const raw = input as Partial<FilmRequest>;
    const title = typeof raw?.title === "string" ? raw.title.trim() : "";
    const note = typeof raw?.note === "string" ? raw.note.trim() : "";
    const year = raw?.year === undefined || raw.year === null || String(raw.year) === "" ? undefined : Number(raw.year);
    if (!title || title.length > 100) throw new Error("影视名称需为 1-100 个字符。");
    if (note.length > 500 || (year !== undefined && (!Number.isInteger(year) || year < 1880 || year > 2200))) throw new Error("请检查年份或备注（最多 500 字）。");
    if (!["movie", "tv"].includes(raw?.mediaType ?? "")) throw new Error("请选择电影或剧集。");
    const normalized = title.normalize("NFKC").toLowerCase().replace(/\s/g, "");
    if (items.some((item) => item.username === username && ["pending", "processing"].includes(item.status) && item.title.normalize("NFKC").toLowerCase().replace(/\s/g, "") === normalized && item.year === year && item.mediaType === raw.mediaType)) throw new Error("这条求片已在处理中，请勿重复提交。");
    if (items.filter((item) => item.username === username && Date.parse(item.createdAt) > Date.now() - 86400000).length >= 10) throw new Error("每天最多提交 10 条求片。");
    const time = new Date().toISOString();
    const item: FilmRequest = { id: crypto.randomUUID(), username, title, note, year, mediaType: raw.mediaType!, status: "pending", reply: "", createdAt: time, updatedAt: time };
    items.unshift(item); return item;
  });
}
export function updateFilmRequest(id: string, input: unknown, handledBy: string) {
  return mutate((items) => {
    const item = items.find((entry) => entry.id === id); if (!item) throw new Error("求片记录不存在。");
    const raw = input as Partial<FilmRequest>;
    if (!requestStatuses.includes(raw?.status!)) throw new Error("求片状态不正确。");
    const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";
    if (reply.length > 1000) throw new Error("回复最多 1000 字。");
    item.status = raw.status!; item.reply = reply; item.handledBy = handledBy; item.updatedAt = new Date().toISOString(); return item;
  });
}
