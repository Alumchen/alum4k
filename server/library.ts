import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DownloadResource, MediaItem, MediaSource } from "./types";

const IMAGE_BASE = "https://image.tmdb.org/t/p";
const libraryFile = path.resolve(process.cwd(), "data", "library.json");

function imageUrl(pathOrUrl: string | undefined, size: "w342" | "w500" | "w780" | "w1280") {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${IMAGE_BASE}/${size}${pathOrUrl}`;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function ensureArray(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\n，]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function safeId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function defaultAListPath(input: Partial<MediaItem>) {
  const title = cleanText(input.title ?? input.originalTitle);
  if (!title) return "";
  const category = cleanText(input.category, input.mediaType === "movie" ? "电影" : "电视剧");
  return `/${category}/${title}.mkv`;
}

function defaultAListResource(input: Partial<MediaItem>): DownloadResource | undefined {
  const url = defaultAListPath(input);
  if (!url) return undefined;

  return {
    id: "alist-default",
    type: "115",
    title: "115网盘",
    url,
    note: "默认AList路径"
  };
}

function resourceFromSource(source: MediaSource | undefined, fallbackTitle = "115网盘") {
  if (!source) return undefined;
  const url = source.path || source.pickcode || source.fileId || "";
  if (!url) return undefined;

  return {
    id: `legacy-115-${safeId(fallbackTitle || url) || Date.now()}`,
    type: "115" as const,
    title: fallbackTitle,
    url,
    code: source.pickcode,
    note: source.type === "direct" ? "旧直链资源" : source.type === "alist" ? "旧AList路径" : "旧115资源"
  };
}

function normalizeResources(input: Partial<MediaItem>) {
  const resources = Array.isArray(input.resources)
    ? (input.resources
        .map((resource, index): DownloadResource | undefined => {
          const type = resource.type === "magnet" ? "magnet" : "115";
          const url = cleanText(resource.url);
          if (!url) return undefined;

          return {
            id: cleanText(resource.id, `res-${index + 1}`),
            type,
            title: cleanText(resource.title, type === "magnet" ? "磁力下载" : "115网盘"),
            url,
            code: cleanText(resource.code),
            size: cleanText(resource.size),
            note: cleanText(resource.note)
          };
        })
        .filter(Boolean) as DownloadResource[])
    : [];

  const legacy = resourceFromSource(input.source, "115网盘");
  if (!resources.length && legacy) resources.push(legacy);
  if (!resources.length) {
    const generated = defaultAListResource(input);
    if (generated) resources.push(generated);
  }
  return resources;
}

function normalizeImages(item: MediaItem): MediaItem {
  return {
    ...item,
    posterPath: imageUrl(item.posterPath, "w500"),
    backdropPath: imageUrl(item.backdropPath, "w1280"),
    resources: normalizeResources(item)
  };
}

async function loadRawLibrary(): Promise<MediaItem[]> {
  const raw = await readFile(libraryFile, "utf-8");
  return JSON.parse(raw) as MediaItem[];
}

async function saveRawLibrary(items: MediaItem[]) {
  await writeFile(libraryFile, `${JSON.stringify(items, null, 2)}\n`, "utf-8");
}

export async function loadLibrary(): Promise<MediaItem[]> {
  const items = await loadRawLibrary();
  return items.map(normalizeImages);
}

export async function findMedia(id: string) {
  const items = await loadLibrary();
  return items.find((item) => item.id === id);
}

export function normalizeMediaItem(input: Partial<MediaItem>, existingIds: string[] = [], currentId?: string): MediaItem {
  const mediaType = input.mediaType === "movie" ? "movie" : "tv";
  const tmdbPart = input.tmdbId ? `tmdb-${mediaType}-${input.tmdbId}` : "";
  const titlePart = safeId(input.title ?? input.originalTitle ?? "");
  const preferredId = safeId(input.id ?? "") || tmdbPart || titlePart || `media-${Date.now()}`;
  let id = preferredId;
  let suffix = 2;

  while (existingIds.includes(id) && id !== currentId) {
    id = `${preferredId}-${suffix}`;
    suffix += 1;
  }

  const access = input.access === "免费" || input.access === "VIP" ? input.access : "会员";
  const source = input.source?.provider
    ? {
        provider: "115" as const,
        type: input.source.type ?? "pan115",
        pickcode: cleanText(input.source.pickcode),
        fileId: cleanText(input.source.fileId),
        path: cleanText(input.source.path),
        directUrl: cleanText(input.source.directUrl)
      }
    : undefined;

  return {
    id,
    tmdbId: cleanNumber(input.tmdbId),
    mediaType,
    title: cleanText(input.title, "未命名"),
    originalTitle: cleanText(input.originalTitle),
    year: cleanNumber(input.year),
    category: cleanText(input.category, mediaType === "movie" ? "电影" : "电视剧"),
    region: cleanText(input.region, "其他"),
    access,
    status: cleanText(input.status, mediaType === "movie" ? "正片" : "待更新"),
    rating: cleanNumber(input.rating),
    genres: ensureArray(input.genres),
    cast: ensureArray(input.cast),
    overview: cleanText(input.overview, "暂无简介。"),
    posterPath: cleanText(input.posterPath),
    backdropPath: cleanText(input.backdropPath),
    source,
    resources: normalizeResources(input),
    episodes: Array.isArray(input.episodes)
      ? input.episodes.map((episode, index) => ({
          id: cleanText(episode.id, `${index + 1}`),
          title: cleanText(episode.title, mediaType === "movie" ? "正片" : `第${index + 1}集`),
          subtitle: cleanText(episode.subtitle),
          source: episode.source?.provider
            ? {
                provider: "115" as const,
                type: episode.source.type ?? source?.type ?? "pan115",
                pickcode: cleanText(episode.source.pickcode),
                fileId: cleanText(episode.source.fileId),
                path: cleanText(episode.source.path),
                directUrl: cleanText(episode.source.directUrl)
              }
            : source
        }))
      : []
  };
}

export async function upsertMedia(input: Partial<MediaItem>, currentId?: string) {
  const items = await loadRawLibrary();
  const existingIds = items.map((item) => item.id);
  const nextItem = normalizeMediaItem(input, existingIds, currentId);
  const index = currentId ? items.findIndex((item) => item.id === currentId) : items.findIndex((item) => item.id === nextItem.id);

  if (index >= 0) {
    items[index] = nextItem;
  } else {
    items.unshift(nextItem);
  }

  await saveRawLibrary(items);
  return normalizeImages(nextItem);
}

export async function deleteMedia(id: string) {
  const items = await loadRawLibrary();
  const nextItems = items.filter((item) => item.id !== id);
  if (nextItems.length === items.length) return false;
  await saveRawLibrary(nextItems);
  return true;
}
