import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import seed from "../plugins/alumwindows/catalog.seed.json";
import type { WindowsStore, WindowsResource } from "../shared/windows";

const file = path.resolve(process.cwd(), "data/windows/catalog.json");
let pending: Promise<unknown> = Promise.resolve();
export class WindowsConflict extends Error {}
function text(value: unknown, limit: number, required = false) { if (typeof value !== "string" || value.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || required && !value.trim()) throw new Error("资源字段为空、格式不正确或超出长度限制。"); return value; }
function id(value: unknown) { if (typeof value !== "string" || !/^[\w-]{1,100}$/.test(value)) throw new Error("资源 ID 不正确。"); return value; }
export function validateWindowsStore(input: WindowsStore): WindowsStore {
  if (!input || !input.settings || !Number.isSafeInteger(input.revision) || input.revision < 0 || !Array.isArray(input.categories) || input.categories.length > 100 || !Array.isArray(input.items) || input.items.length > 2000) throw new Error("资源仓库格式不正确。");
  const settings = { name: text(input.settings.name, 40, true), description: text(input.settings.description, 240), notice: text(input.settings.notice, 2000) };
  const categories = input.categories.map((name) => text(name, 100, true));
  if (new Set(categories).size !== categories.length) throw new Error("分类不能重复。");
  const ids = new Set<string>();
  const items = input.items.map((item) => {
    if (!item || typeof item.published !== "boolean" || !categories.includes(item.category) || !Array.isArray(item.links) || item.links.length > 30 || ids.has(item.id)) throw new Error("资源分类、ID 或下载链接不正确。");
    ids.add(item.id);
    const links = item.links.map((link) => ({ name: text(link?.name, 80, true), url: text(link?.url, 20000, true) }));
    return { id: id(item.id), sourceId: text(item.sourceId ?? "", 100), category: item.category, group: text(item.group, 200), title: text(item.title, 500, true), architecture: text(item.architecture, 80), edition: text(item.edition, 200), activation: text(item.activation, 200), date: text(item.date, 100), info: text(item.info, 20000), published: item.published, links };
  });
  return { revision: input.revision, settings, categories, items, source: input.source === "https://hellowindows.cn/" ? input.source : "", collectedAt: typeof input.collectedAt === "string" && Number.isFinite(Date.parse(input.collectedAt)) ? input.collectedAt : "" };
}
export async function loadWindows(): Promise<WindowsStore> { try { return validateWindowsStore(JSON.parse(await readFile(file, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return validateWindowsStore(structuredClone(seed)); throw error; } }
function mutate<T>(change: (store: WindowsStore) => T) {
  const next = pending.then(async () => { const store = await loadWindows(); const result = change(store); const validated = validateWindowsStore(store); validated.revision = store.revision + 1; await mkdir(path.dirname(file), { recursive: true }); try { await copyFile(file, file + ".bak"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } const temporary = `${file}.${crypto.randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(validated, null, 2) + "\n", { mode: 0o600 }); await rename(temporary, file); return { result, store: validated }; }); pending = next.catch(() => undefined); return next;
}
function checkRevision(store: WindowsStore, revision: unknown) { if (revision !== store.revision) throw new WindowsConflict("资源已在其他页面更新，请重新载入后再编辑。"); }
export function saveWindowsResource(input: WindowsResource, revision: number, resourceId?: string) { return mutate((store) => {
  checkRevision(store, revision); const index = resourceId ? store.items.findIndex((item) => item.id === resourceId) : -1;
  if (resourceId && index < 0) throw new Error("资源不存在，请刷新后重试。");
  const item = { ...input, id: resourceId || crypto.randomUUID() };
  if (index < 0) store.items.unshift(item); else store.items[index] = item;
}); }
export function deleteWindowsResource(resourceId: string, revision: number) { return mutate((store) => { checkRevision(store, revision); if (!store.items.some((item) => item.id === resourceId)) throw new Error("资源不存在。"); store.items = store.items.filter((item) => item.id !== resourceId); }); }
export function saveWindowsSettings(input: WindowsStore["settings"], revision: number) { return mutate((store) => { checkRevision(store, revision); store.settings = input; }); }
export function saveWindowsCategories(categories: string[], revision: number) { return mutate((store) => { checkRevision(store, revision); store.categories = categories; }); }
export function importWindows(input: WindowsStore, revision: number, mode: "merge" | "replace") { const imported = validateWindowsStore(input); return mutate((store) => {
  checkRevision(store, revision);
  if (mode === "replace") { store.items = imported.items; store.categories = imported.categories; }
  else {
    const incoming = new Map(imported.items.map((item) => [item.id, item]));
    store.items = store.items.map((item) => { const next = incoming.get(item.id); incoming.delete(item.id); return next ? { ...next, published: item.published } : item; });
    store.items.push(...incoming.values()); store.categories = [...new Set([...store.categories, ...imported.categories])];
  }
  store.source = imported.source; store.collectedAt = imported.collectedAt;
}); }
