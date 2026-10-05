import "dotenv/config";
import { Readable } from "node:stream";
import express from "express";
import {
  ensureAdminUser,
  listUsers,
  loginUser,
  registerUser,
  requireAuth,
  requireAdmin,
  requireVip,
  setUserVip,
  userFromRequest,
  type AuthenticatedRequest
} from "./auth";
import { deleteMedia, findMedia, loadLibrary, upsertMedia } from "./library";
import { getTmdbDetail, hasTmdbCredentials, searchTmdb } from "./tmdb";
import { SourceUnavailableError } from "./pan115";
import { listAListDirectory, resolveWatchUrl, WatchUnavailableError } from "./watch";
import type { DownloadResource, MediaItem, MediaType } from "./types";

const app = express();
const port = Number(process.env.API_PORT ?? 5174);

app.use(express.json({ limit: "2mb" }));

function matchLocal(items: MediaItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;

  return items.filter((item) => {
    return [
      item.title,
      item.originalTitle,
      item.category,
      item.region,
      item.status,
      ...item.genres,
      ...item.cast
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  });
}

function normalizeExactSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[《》<>""'']/g, "")
    .replace(/[\s._\-:：·，,。/\\]+/g, "");
}

function matchExactLocal(items: MediaItem[], query: string) {
  const normalized = normalizeExactSearch(query);
  if (!normalized) return items;

  return items.filter((item) => {
    const titleMatched = [item.title, item.originalTitle]
      .filter(Boolean)
      .some((value) => normalizeExactSearch(value) === normalized);
    const tmdbMatched = item.tmdbId ? String(item.tmdbId) === query.trim() : false;
    return titleMatched || tmdbMatched;
  });
}

function readMediaType(value: unknown): MediaType {
  return value === "movie" ? "movie" : "tv";
}

function hasVipAccess(user: { role: "admin" | "user"; vip: boolean } | null) {
  return Boolean(user?.vip || user?.role === "admin");
}

function redactResourcesForPublic(item: MediaItem, canViewResources: boolean): MediaItem {
  if (canViewResources) return item;
  return {
    ...item,
    resources: item.resources?.map((resource) => ({
      id: resource.id,
      type: resource.type,
      title: resource.title,
      url: "",
      size: resource.size,
      note: resource.note
    }))
  };
}

function inferredVideoType(resource: DownloadResource | undefined, upstreamType: string | null) {
  const url = resource?.url.toLowerCase() ?? "";
  if (url.endsWith(".mp4") || url.endsWith(".m4v")) return "video/mp4";
  if (url.endsWith(".webm")) return "video/webm";
  if (url.endsWith(".mov")) return "video/quicktime";
  if (url.endsWith(".mkv")) return "video/x-matroska";
  if (upstreamType && upstreamType !== "application/octet-stream") return upstreamType;
  return "video/mp4";
}

function copyHeader(source: Headers, response: express.Response, name: string) {
  const value = source.get(name);
  if (value) response.setHeader(name, value);
}

function humanSize(bytes: number | undefined) {
  if (!bytes || !Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function rangeSize(contentRange: string | null, contentLength: string | null) {
  const total = contentRange?.match(/\/(\d+)$/)?.[1] ?? contentLength ?? "";
  const bytes = Number(total);
  return Number.isFinite(bytes) ? humanSize(bytes) : "";
}

function analyzeResourceName(url: string) {
  const decoded = decodeURIComponent(url).toLowerCase();
  const warnings: string[] = [];
  let codecHint = "未知编码";
  let containerHint = "未知封装";

  if (/\.(mp4|m4v)(\?|$)/i.test(decoded)) containerHint = "MP4";
  else if (/\.(mkv)(\?|$)/i.test(decoded)) {
    containerHint = "MKV";
    warnings.push("MKV 在网页播放器中兼容性较差，建议转为 MP4。");
  } else if (/\.(webm)(\?|$)/i.test(decoded)) containerHint = "WebM";

  if (/(h\.?265|x265|hevc|hev1|hvc1)/i.test(decoded)) {
    codecHint = "H.265/HEVC";
    warnings.push("H.265/HEVC 浏览器兼容性不稳定，建议准备 H.264/AAC 版本或转码。");
  } else if (/(h\.?264|x264|avc1|avc)/i.test(decoded)) {
    codecHint = "H.264/AVC";
  }

  if (/(2160p|4k|uhd)/i.test(decoded)) {
    warnings.push("4K 视频对浏览器解码性能要求较高，播放失败时建议转码或降到 1080P。");
  }

  return { codecHint, containerHint, warnings };
}

async function checkDownloadResource(resource: DownloadResource | undefined) {
  const warnings: string[] = [];
  if (!resource?.url?.trim()) {
    return { ok: false, playable: false, message: "资源地址为空。", warnings };
  }

  if (resource.type === "magnet") {
    return {
      ok: true,
      playable: false,
      message: "磁力链接只能作为下载入口，不能用于在线播放。",
      warnings: ["磁力链接无法直接用于网页在线播放。"]
    };
  }

  const nameInfo = analyzeResourceName(resource.url);
  warnings.push(...nameInfo.warnings);

  try {
    const watchUrl = await resolveWatchUrl(resource);
    const upstream = await fetch(watchUrl, {
      headers: { range: "bytes=0-0", accept: "video/*,*/*" }
    });
    const ok = upstream.status === 200 || upstream.status === 206;
    const contentType = inferredVideoType(resource, upstream.headers.get("content-type"));
    const playable = ok && !warnings.some((warning) => warning.includes("H.265") || warning.includes("MKV"));

    return {
      ok,
      playable,
      status: upstream.status,
      contentType,
      size: rangeSize(upstream.headers.get("content-range"), upstream.headers.get("content-length")),
      codecHint: nameInfo.codecHint,
      containerHint: nameInfo.containerHint,
      message: ok ? (playable ? "资源可访问，网页播放兼容性较好。" : "资源可访问，但浏览器可能无法直接播放。") : `视频源请求失败：${upstream.status}`,
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      playable: false,
      codecHint: nameInfo.codecHint,
      containerHint: nameInfo.containerHint,
      message: error instanceof Error ? error.message : "资源检测失败。",
      warnings
    };
  }
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    tmdb: hasTmdbCredentials(),
    downloads: true,
    auth: true,
    alist: Boolean(process.env.ALIST_BASE_URL)
  });
});

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const result = await registerUser(String(request.body?.username ?? ""), String(request.body?.password ?? ""));
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "注册失败。" });
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const result = await loginUser(String(request.body?.username ?? ""), String(request.body?.password ?? ""));
    response.json(result);
  } catch (error) {
    response.status(401).json({ message: error instanceof Error ? error.message : "登录失败。" });
  }
});

app.get("/api/auth/me", requireAuth, (request: AuthenticatedRequest, response) => {
  response.json({ user: request.user });
});

app.get("/api/admin/users", requireAdmin, async (_request, response, next) => {
  try {
    response.json({ users: await listUsers() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/users/:username/vip", requireAdmin, async (request, response, next) => {
  try {
    const user = await setUserVip(request.params.username, Boolean(request.body?.vip), request.body?.vipUntil);
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get("/api/media", async (request, response, next) => {
  try {
    const items = await loadLibrary();
    const query = typeof request.query.q === "string" ? request.query.q : "";
    const exact = request.query.exact === "1" || request.query.exact === "true";
    const user = await userFromRequest(request);
    const matchedItems = exact ? matchExactLocal(items, query) : matchLocal(items, query);
    response.json({ items: matchedItems.map((item) => redactResourcesForPublic(item, hasVipAccess(user))) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/media/:id", async (request, response, next) => {
  try {
    const item = await findMedia(request.params.id);
    if (!item) {
      response.status(404).json({ message: "未找到媒体条目。" });
      return;
    }
    const user = await userFromRequest(request);
    response.json({ item: redactResourcesForPublic(item, hasVipAccess(user)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/media", requireAdmin, async (request, response, next) => {
  try {
    const item = await upsertMedia(request.body);
    response.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/media/:id", requireAdmin, async (request, response, next) => {
  try {
    const item = await upsertMedia({ ...request.body, id: request.params.id }, request.params.id);
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/media/:id", requireAdmin, async (request, response, next) => {
  try {
    const deleted = await deleteMedia(request.params.id);
    if (!deleted) {
      response.status(404).json({ message: "未找到媒体条目。" });
      return;
    }
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/collect-tmdb", requireAdmin, async (request, response, next) => {
  try {
    const tmdbId = Number(request.body?.tmdbId);
    if (!Number.isFinite(tmdbId)) {
      response.status(400).json({ message: "TMDB ID 不正确。" });
      return;
    }

    const mediaType = readMediaType(request.body?.mediaType);
    const detail = await getTmdbDetail(mediaType, tmdbId);
    const resources = Array.isArray(request.body?.resources) ? request.body.resources : [];
    const episodes = Array.isArray(request.body?.episodes) && request.body.episodes.length
      ? request.body.episodes
      : mediaType === "movie"
        ? [{ id: "movie", title: "正片", subtitle: "下载资源" }]
        : [];

    const item = await upsertMedia({
      ...detail,
      ...request.body,
      tmdbId,
      mediaType,
      resources,
      episodes
    });
    response.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/check-resource", requireAdmin, async (request, response, next) => {
  try {
    const raw = request.body?.resource ?? {};
    const resource: DownloadResource = {
      id: String(raw.id ?? "check"),
      type: raw.type === "magnet" ? "magnet" : "115",
      title: String(raw.title ?? ""),
      url: String(raw.url ?? ""),
      code: raw.code ? String(raw.code) : undefined,
      size: raw.size ? String(raw.size) : undefined,
      note: raw.note ? String(raw.note) : undefined
    };
    response.json({ result: await checkDownloadResource(resource) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/alist/list", requireAdmin, async (request, response, next) => {
  try {
    const path = String(request.body?.path ?? "/");
    response.json({ result: await listAListDirectory(path) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tmdb/search", async (request, response, next) => {
  try {
    const query = String(request.query.q ?? "").trim();
    if (!query) {
      response.json({ items: [] });
      return;
    }

    if (!hasTmdbCredentials()) {
      const user = await userFromRequest(request);
      const items = matchLocal(await loadLibrary(), query).map((item) => redactResourcesForPublic(item, hasVipAccess(user)));
      response.json({ items, fallback: true });
      return;
    }

    const items = await searchTmdb(query);
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tmdb/:mediaType/:id", async (request, response, next) => {
  try {
    const mediaType = request.params.mediaType === "movie" ? "movie" : "tv";
    const id = Number(request.params.id);
    if (!Number.isFinite(id)) {
      response.status(400).json({ message: "TMDB ID 不正确。" });
      return;
    }

    const item = await getTmdbDetail(mediaType, id);
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

app.get("/api/watch/:mediaId/:resourceId", requireVip, async (request, response, next) => {
  try {
    const item = await findMedia(request.params.mediaId);
    if (!item) {
      response.status(404).json({ message: "未找到媒体条目。" });
      return;
    }

    const resource = item.resources?.find((entry) => entry.id === request.params.resourceId);
    const watchUrl = await resolveWatchUrl(resource);
    const upstream = await fetch(watchUrl, {
      headers: {
        ...(request.headers.range ? { range: request.headers.range } : {}),
        accept: "video/*,*/*"
      }
    });

    if (!upstream.body || upstream.status >= 400) {
      throw new WatchUnavailableError(`视频源请求失败：${upstream.status}`);
    }

    response.status(upstream.status);
    response.setHeader("Content-Type", inferredVideoType(resource, upstream.headers.get("content-type")));
    response.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") ?? "bytes");
    response.setHeader("Cache-Control", "no-store");
    copyHeader(upstream.headers, response, "content-length");
    copyHeader(upstream.headers, response, "content-range");
    copyHeader(upstream.headers, response, "last-modified");

    Readable.fromWeb(upstream.body as never).pipe(response);
  } catch (error) {
    next(error);
  }
});

app.get("/api/source/:mediaId/:episodeId?", async (_request, response) => {
  response.status(410).json({ message: "在线播放已取消，请使用下载资源。" });
});

app.get("/api/stream/:mediaId/:episodeId?", async (_request, response) => {
  response.status(410).json({ message: "在线播放已取消，请使用下载资源。" });
});

/*
app.get("/api/source/:mediaId/:episodeId?", async (request, response, next) => {
  try {
    const item = await findMedia(request.params.mediaId);
    if (!item) {
      response.status(404).json({ playable: false, message: "未找到媒体条目。" });
      return;
    }

    const source = episodeSource(item, request.params.episodeId);
    response.json({
      playable: isSourceConfigured(source),
      url: isSourceConfigured(source)
        ? `/api/stream/${encodeURIComponent(item.id)}/${encodeURIComponent(request.params.episodeId ?? item.episodes[0]?.id ?? "main")}`
        : "",
      provider: source?.provider ?? "115",
      type: source?.type ?? "pan115",
      message: isSourceConfigured(source) ? "" : "请在 .env 中配置 115 解析服务，或在媒体库中绑定 direct/alist 源。"
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stream/:mediaId/:episodeId?", async (request, response, next) => {
  try {
    const item = await findMedia(request.params.mediaId);
    if (!item) {
      response.status(404).json({ message: "未找到媒体条目。" });
      return;
    }

    const source = episodeSource(item, request.params.episodeId);
    const resolved = await resolveSource(source);
    response.redirect(302, resolved.playUrl);
  } catch (error) {
    next(error);
  }
});
*/

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof SourceUnavailableError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  if (error instanceof WatchUnavailableError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "服务端异常。";
  response.status(500).json({ message });
});

await ensureAdminUser();

app.listen(port, () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
