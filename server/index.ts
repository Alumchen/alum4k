import "dotenv/config";
import express from "express";
import {
  ensureAdminUser, listUsers, loginUser, registerUser, requireAuth, requireAdmin,
  setUserVip, userFromRequest, type AuthenticatedRequest
} from "./auth";
import { batchMedia, deleteMedia, findMedia, importLibrary, loadLibrary, upsertMedia } from "./library";
import { getTmdbDetail, hasTmdbCredentials, searchTmdb } from "./tmdb";
import { loadSettings, saveSettings } from "./settings";
import { isDownloadUrl } from "../shared/media";
import type { MediaItem, MediaType } from "./types";

const app = express();
const port = Number(process.env.API_PORT ?? 5174);
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

function normalizeExactSearch(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[《》<>"']/g, "").replace(/[\s._\-:：·，,。/\\]+/g, "");
}

function matchLocal(items: MediaItem[], query: string, exact = false) {
  const term = query.trim().toLowerCase();
  if (!term) return items;
  return items.filter((item) => exact
    ? [item.title, item.originalTitle].some((value) => value && normalizeExactSearch(value) === normalizeExactSearch(term)) ||
      (item.tmdbId !== undefined && String(item.tmdbId) === term)
    : [item.title, item.originalTitle, item.category, item.region, ...item.genres, ...item.cast]
      .some((value) => value?.toLowerCase().includes(term)));
}

async function visibleMedia(request: express.Request, items: MediaItem[]) {
  const user = await userFromRequest(request);
  if (user?.vip || user?.role === "admin") return items;
  return items.map((item) => ({
    ...item,
    resources: item.resources?.map(({ code: _code, url: _url, ...resource }) => ({ ...resource, url: "" }))
  }));
}

function readMediaType(value: unknown): MediaType {
  return value === "movie" ? "movie" : "tv";
}

function validateResources(input: Partial<MediaItem>) {
  if (!Array.isArray(input.resources)) return;
  if (input.resources.length > 500) throw new Error("每个条目最多保存 500 个下载链接。");
  for (const resource of input.resources) {
    if (!resource || !["115", "magnet"].includes(resource.type) || !isDownloadUrl(resource.type, String(resource.url ?? ""))) {
      throw new Error("请填写有效的 115 网盘链接或磁力链接，AList 路径已停用。");
    }
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, tmdb: hasTmdbCredentials(), downloads: true, auth: true, playback: false });
});

app.get("/api/settings", async (_request, response, next) => {
  try { response.json(await loadSettings()); } catch (error) { next(error); }
});

app.put("/api/admin/settings", requireAdmin, async (request, response) => {
  try { response.json(await saveSettings(request.body)); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "公告保存失败。" }); }
});

app.post("/api/auth/register", async (request, response) => {
  try { response.status(201).json(await registerUser(String(request.body?.username ?? ""), String(request.body?.password ?? ""))); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "注册失败。" }); }
});

app.post("/api/auth/login", async (request, response) => {
  try { response.json(await loginUser(String(request.body?.username ?? ""), String(request.body?.password ?? ""))); }
  catch (error) { response.status(401).json({ message: error instanceof Error ? error.message : "登录失败。" }); }
});

app.get("/api/auth/me", requireAuth, (request: AuthenticatedRequest, response) => response.json({ user: request.user }));

app.get("/api/admin/users", requireAdmin, async (_request, response, next) => {
  try { response.json({ users: await listUsers() }); } catch (error) { next(error); }
});

app.put("/api/admin/users/:username/vip", requireAdmin, async (request, response, next) => {
  try { response.json({ user: await setUserVip(request.params.username, request.body?.vip === true, request.body?.vipUntil) }); }
  catch (error) { next(error); }
});

app.get("/api/media", async (request, response, next) => {
  try {
    const query = typeof request.query.q === "string" ? request.query.q : "";
    response.json({ items: await visibleMedia(request, matchLocal(await loadLibrary(), query, request.query.exact === "1" || request.query.exact === "true")) });
  } catch (error) { next(error); }
});

app.get("/api/media/:id", async (request, response, next) => {
  try {
    const item = await findMedia(request.params.id);
    if (!item) { response.status(404).json({ message: "未找到影视条目。" }); return; }
    response.json({ item: (await visibleMedia(request, [item]))[0] });
  } catch (error) { next(error); }
});

app.post("/api/admin/media/batch", requireAdmin, async (request, response) => {
  try {
    const { action, ids } = request.body ?? {};
    if (!["classify", "delete"].includes(action) || !Array.isArray(ids) || !ids.length || ids.length > 2000 || ids.some((id) => typeof id !== "string")) {
      response.status(400).json({ message: "请选择影视条目和有效的批量操作。" }); return;
    }
    response.json({ count: await batchMedia(action, ids) });
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "批量操作失败。" }); }
});

app.post("/api/admin/media/import", requireAdmin, async (request, response) => {
  try {
    const items = request.body?.items;
    if (!Array.isArray(items) || !items.length || items.length > 2000) {
      response.status(400).json({ message: "导入文件应包含 1-2000 个影视条目。" }); return;
    }
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("导入文件包含无效条目。");
      validateResources(item);
    }
    response.json({ count: await importLibrary(items) });
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "导入失败。" }); }
});

app.post("/api/admin/media", requireAdmin, async (request, response) => {
  try { validateResources(request.body); response.status(201).json({ item: await upsertMedia(request.body) }); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "保存失败。" }); }
});

app.put("/api/admin/media/:id", requireAdmin, async (request, response) => {
  try { validateResources(request.body); response.json({ item: await upsertMedia({ ...request.body, id: request.params.id }, request.params.id) }); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "保存失败。" }); }
});

app.delete("/api/admin/media/:id", requireAdmin, async (request, response, next) => {
  try {
    if (!await deleteMedia(request.params.id)) { response.status(404).json({ message: "未找到影视条目。" }); return; }
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/admin/collect-tmdb", requireAdmin, async (request, response, next) => {
  try {
    const tmdbId = Number(request.body?.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) { response.status(400).json({ message: "TMDB ID 不正确。" }); return; }
    const mediaType = readMediaType(request.body?.mediaType);
    validateResources(request.body);
    const detail = await getTmdbDetail(mediaType, tmdbId);
    response.status(201).json({ item: await upsertMedia({
      ...detail, ...request.body, tmdbId, mediaType, genres: detail.genres,
      resources: request.body.resources ?? [],
      episodes: detail.episodes
    }) });
  } catch (error) { next(error); }
});

app.get("/api/tmdb/search", requireAdmin, async (request, response, next) => {
  try {
    const query = String(request.query.q ?? "").trim();
    if (!query) { response.json({ items: [] }); return; }
    if (!hasTmdbCredentials()) { response.json({ items: matchLocal(await loadLibrary(), query), fallback: true }); return; }
    response.json({ items: await searchTmdb(query) });
  } catch (error) { next(error); }
});

app.get("/api/tmdb/:mediaType/:id", requireAdmin, async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) { response.status(400).json({ message: "TMDB ID 不正确。" }); return; }
    response.json({ item: await getTmdbDetail(readMediaType(request.params.mediaType), id) });
  } catch (error) { next(error); }
});

app.use(["/api/watch", "/api/source", "/api/stream", "/api/admin/alist", "/api/admin/check-resource"], (_request, response) => {
  response.status(410).json({ message: "在线播放已停用，请使用 115 网盘或磁力链接。" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error instanceof Error ? error.message : "Server error");
  response.status(500).json({ message: "服务暂时不可用，请稍后重试或联系管理员。" });
});

await ensureAdminUser();
app.listen(port, "0.0.0.0", () => console.log(`API listening on http://127.0.0.1:${port}`));
