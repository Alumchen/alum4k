import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { classifyMedia } from "../shared/media";
import type { DownloadResource, MediaItem } from "./types";
import { normalizeResourceDetails } from "../shared/resources";

const libraryFile = path.resolve(process.cwd(), "data", "library.json");
let pendingWrite: Promise<unknown> = Promise.resolve();

function mutateLibrary<T>(update: (items: MediaItem[]) => Promise<T>) {
  const next = pendingWrite.then(async () => update(await loadRawLibrary()));
  pendingWrite = next.catch(() => undefined);
  return next;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function ensureArray(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n，]/) : [];
  return values.map((entry) => String(entry).trim()).filter(Boolean);
}

function safeId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function normalizeResources(input: Partial<MediaItem>): DownloadResource[] {
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  return (Array.isArray(input.resources) ? input.resources : []).flatMap((resource, index) => {
    if (!resource || !["115", "magnet"].includes(resource.type)) return [];
    const url = typeof resource.url === "string" ? resource.url : "";
    if (!url.trim()) return [];
    const key = `${resource.type}:${url}`;
    if (seenUrls.has(key)) return [];
    seenUrls.add(key);
    const preferredId = cleanText(resource.id, `res-${index + 1}`);
    let id = preferredId;
    let suffix = 2;
    while (seenIds.has(id)) id = `${preferredId}-${suffix++}`;
    seenIds.add(id);
    return [{
      ...normalizeResourceDetails(resource),
      id,
      type: resource.type,
      title: cleanText(resource.title, resource.type === "magnet" ? "磁力链接" : "115网盘"),
      url,
      code: cleanText(resource.code),
      size: cleanText(resource.size),
      note: cleanText(resource.note),
      access: resource.access === "free" || resource.access === "vip" ? resource.access : input.access === "免费" ? "free" : "vip"
    }];
  });
}

function imageUrl(value: string | undefined, size: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://image.tmdb.org/t/p/${size}${value}`;
}

function publicMedia(item: MediaItem): MediaItem {
  const categoryMode = item.categoryMode ?? (["电影", "电视剧"].includes(item.category) ? "auto" : "manual");
  return {
    ...item,
    categoryMode,
    category: categoryMode === "auto" ? classifyMedia(item) : item.category,
    source: undefined,
    episodes: (item.episodes ?? []).map((episode) => ({ ...episode, source: undefined })),
    posterPath: imageUrl(item.posterPath, "w500"),
    backdropPath: imageUrl(item.backdropPath, "w1280"),
    resources: normalizeResources(item)
  };
}

async function loadRawLibrary(): Promise<MediaItem[]> {
  const raw = await readFile(libraryFile, "utf-8");
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error("媒体库文件格式不正确。");
  return items;
}

async function saveRawLibrary(items: MediaItem[]) {
  await mkdir(path.dirname(libraryFile), { recursive: true });
  const temporaryFile = `${libraryFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(items, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  await rename(temporaryFile, libraryFile);
}

export async function loadLibrary() {
  return (await loadRawLibrary()).map(publicMedia);
}

export async function findMedia(id: string) {
  return (await loadLibrary()).find((item) => item.id === id);
}

export function normalizeMediaItem(input: Partial<MediaItem>, existingIds: string[] = [], currentId?: string): MediaItem {
  const mediaType = input.mediaType === "movie" ? "movie" : "tv";
  const title = cleanText(input.title);
  if (!title) throw new Error("请填写影视标题。");
  const preferredId = safeId(input.id ?? "") || (input.tmdbId ? `tmdb-${mediaType}-${input.tmdbId}` : safeId(title)) || `media-${Date.now()}`;
  let id = preferredId;
  let suffix = 2;
  while (existingIds.includes(id) && id !== currentId) id = `${preferredId}-${suffix++}`;
  const genres = ensureArray(input.genres);
  const categoryMode = input.categoryMode === "manual" ? "manual" : "auto";
  return {
    id,
    tmdbId: cleanNumber(input.tmdbId),
    mediaType,
    title,
    originalTitle: cleanText(input.originalTitle),
    aliases: [...new Set(ensureArray(input.aliases))].filter((value) => value !== title).slice(0, 20).map((value) => value.slice(0, 100)),
    year: cleanNumber(input.year),
    category: categoryMode === "auto" ? classifyMedia({ mediaType, genres }) : cleanText(input.category, classifyMedia({ mediaType, genres })),
    categoryMode,
    featured: input.featured === true,
    createdAt: cleanText(input.createdAt, new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    region: cleanText(input.region, "其他"),
    access: input.access === "免费" || input.access === "VIP" ? input.access : "会员",
    status: cleanText(input.status, mediaType === "movie" ? "正片" : "待更新"),
    rating: cleanNumber(input.rating),
    genres,
    cast: ensureArray(input.cast),
    overview: cleanText(input.overview, "暂无简介。"),
    posterPath: cleanText(input.posterPath),
    backdropPath: cleanText(input.backdropPath),
    resources: normalizeResources(input),
    episodes: Array.isArray(input.episodes) ? input.episodes.map((episode, index) => ({
      id: cleanText(episode.id, `${index + 1}`),
      title: cleanText(episode.title, mediaType === "movie" ? "正片" : `第${index + 1}集`),
      subtitle: cleanText(episode.subtitle)
    })) : []
  };
}

function saveItem(items: MediaItem[], input: Partial<MediaItem>, currentId?: string) {
  const existing = (currentId ? items.find((item) => item.id === currentId) : undefined) ?? items.find((item) =>
    (input.id && item.id === input.id) || (input.tmdbId && item.tmdbId === input.tmdbId && item.mediaType === input.mediaType)
  );
  const next = normalizeMediaItem({ ...input, id: existing?.id ?? input.id, createdAt: existing?.createdAt ?? input.createdAt }, items.map((item) => item.id), existing?.id);
  next.resources = next.resources?.map((resource) => {
    const old = existing ? normalizeResources(existing).find((entry) => entry.id === resource.id) : undefined;
    const fields = ["url", "code", "title", "size", "note", "access", "resolution", "dynamicRange", "videoCodec", "subtitles", "audio", "availability"] as const;
    const unchanged = old && fields.every((key) => (old[key] ?? "") === (resource[key] ?? ""));
    const sameLink = old?.url === resource.url;
    const checked = resource.availability !== "unknown";
    return { ...resource, updatedAt: unchanged ? old.updatedAt ?? next.updatedAt : next.updatedAt,
      verifiedAt: checked ? sameLink && old?.availability === resource.availability ? old.verifiedAt ?? next.updatedAt : next.updatedAt : undefined };
  });
  const index = existing ? items.indexOf(existing) : -1;
  if (index >= 0) items[index] = next;
  else items.unshift(next);
  return publicMedia(next);
}

export async function upsertMedia(input: Partial<MediaItem>, currentId?: string) {
  return mutateLibrary(async (items) => {
    const next = saveItem(items, input, currentId);
    await saveRawLibrary(items);
    return next;
  });
}

export function markResourceInvalid(mediaId: string, resourceId: string, expectedHash: string) {
  return mutateLibrary(async (items) => {
    const item = items.find((entry) => entry.id === mediaId);
    const resources = item ? normalizeResources(item) : [];
    const resource = resources.find((entry) => entry.id === resourceId);
    if (!item || !resource) throw new Error("资源已删除，可直接忽略这条反馈。");
    if (crypto.createHash("sha256").update(resource.url).digest("hex") !== expectedHash) throw new Error("链接已被更换，请重新核验后处理反馈。");
    const time = new Date().toISOString(); resource.availability = "invalid"; resource.verifiedAt = time; resource.updatedAt = time; item.updatedAt = time;
    item.resources = resources;
    await saveRawLibrary(items);
  });
}

export async function deleteMedia(id: string) {
  return mutateLibrary(async (items) => {
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    await saveRawLibrary(next);
    return true;
  });
}

export async function batchMedia(action: "classify" | "delete", ids: string[]) {
  return mutateLibrary(async (items) => {
    const selected = new Set(ids);
    const count = items.filter((item) => selected.has(item.id)).length;
    const next = action === "delete" ? items.filter((item) => !selected.has(item.id)) : items.map((item) =>
      selected.has(item.id) ? { ...item, category: classifyMedia(item), categoryMode: "auto" as const, updatedAt: new Date().toISOString() } : item
    );
    await saveRawLibrary(next);
    return count;
  });
}

export async function importLibrary(input: Partial<MediaItem>[]) {
  return mutateLibrary(async (items) => {
    for (const item of input) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("导入文件包含无效条目。");
      saveItem(items, item);
    }
    await saveRawLibrary(items);
    return input.length;
  });
}
