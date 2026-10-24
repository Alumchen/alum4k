import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin, requireAuth, userFromRequest, type AuthenticatedRequest } from "./auth";
import { pluginEnabled } from "./workbench";
import { loadSettings } from "./settings";
import { escapeHtml, siteOrigin } from "./seo";
import { ChipError, loadChip, publicPost, saveChipPost, saveChipSettings, deleteChipPost, chipReaction, addChipComment, moderateChipComment } from "./xinsj";

type Handler = (request: AuthenticatedRequest, response: Response) => Promise<unknown>;
function route(handler: Handler): RequestHandler { return (request: Request, response: Response, next: NextFunction) => { handler(request, response).catch((error) => { if (error instanceof ChipError) response.status(error.status).json({ message: error.message }); else next(error); }); }; }
export function addChipRoutes(app: Express) {
  app.get("/xinsj/sitemap.xml", route(async (request, response) => { if (!await pluginEnabled("alumxinsj")) throw new ChipError("模块暂未启用。", 404); const store = await loadChip(); const origin = escapeHtml(siteOrigin(await loadSettings(), request)); response.setHeader("Cache-Control", "no-store"); response.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/xinsj</loc></url>${store.posts.filter((post) => post.status === "published").map((post) => `<url><loc>${origin}/xinsj/post/${post.id}</loc></url>`).join("")}</urlset>`); }));
  app.use("/api/xinsj", async (_request, response, next) => { try { if (!await pluginEnabled("alumxinsj")) { response.status(503).json({ message: "Alum芯世界暂未启用。" }); return; } response.setHeader("Cache-Control", "no-store"); next(); } catch (error) { next(error); } });
  app.get("/api/xinsj", route(async (request, response) => {
    const store = await loadChip(); const user = await userFromRequest(request);
    const query = (key: string) => typeof request.query[key] === "string" ? String(request.query[key]).slice(0, 200) : "";
    const mode = query("mode"); if (["mine", "saved"].includes(mode) && !user) throw new ChipError("请先登录。", 401);
    const published = store.posts.filter((post) => post.status === "published");
    let items = mode === "mine" ? store.posts.filter((post) => post.author === user!.username) : published;
    if (mode === "saved") items = items.filter((post) => post.saves.includes(user!.username));
    if (query("category")) items = items.filter((post) => post.category === query("category"));
    if (query("kind")) items = items.filter((post) => post.kind === query("kind"));
    if (query("q")) { const q = query("q").toLocaleLowerCase(); items = items.filter((post) => [post.title, post.content, ...post.tags].join(" ").toLocaleLowerCase().includes(q)); }
    const score = (post: typeof items[number]) => post.likes.length * 3 + store.comments.filter((comment) => comment.postId === post.id && comment.status === "published").length * 2;
    items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (query("sort") === "hot" ? score(b) - score(a) : 0) || b.createdAt.localeCompare(a.createdAt));
    const pages = Math.max(1, Math.ceil(items.length / 12)); const page = Math.min(pages, Math.max(1, Number.parseInt(query("page"), 10) || 1));
    response.json({ settings: store.settings, items: items.slice((page - 1) * 12, page * 12).map((post) => publicPost(store, post, user)), total: items.length, page, pages, hot: [...published].sort((a, b) => score(b) - score(a) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((post) => publicPost(store, post, user)), stats: { posts: published.length, comments: store.comments.filter((comment) => comment.status === "published" && published.some((post) => post.id === comment.postId)).length, contributors: new Set(published.map((post) => post.author)).size } });
  }));
  app.get("/api/xinsj/posts/:id", route(async (request, response) => {
    const store = await loadChip(); const user = await userFromRequest(request); const post = store.posts.find((post) => post.id === request.params.id);
    if (!post || post.status !== "published" && user?.role !== "admin" && user?.username !== post.author) throw new ChipError("帖子不存在或尚未发布。", 404);
    response.json({ item: publicPost(store, post, user), comments: store.comments.filter((comment) => comment.postId === post.id && (comment.status === "published" || user?.role === "admin" || comment.author === user?.username)) });
  }));
  app.post("/api/xinsj/posts", requireAuth, route(async (request, response) => { const store = await saveChipPost(request.body.item, request.user!); response.status(201).json({ item: publicPost(store, store.posts[0], request.user) }); }));
  app.put("/api/xinsj/posts/:id", requireAuth, route(async (request, response) => { const store = await saveChipPost(request.body.item, request.user!, request.params.id, request.body.version); response.json({ item: publicPost(store, store.posts.find((post) => post.id === request.params.id)!, request.user) }); }));
  app.post("/api/xinsj/posts/:id/reactions", requireAuth, route(async (request, response) => { const store = await chipReaction(request.params.id, request.user!, request.body.action); response.json({ item: publicPost(store, store.posts.find((post) => post.id === request.params.id)!, request.user) }); }));
  app.post("/api/xinsj/posts/:id/comments", requireAuth, route(async (request, response) => { const store = await addChipComment(request.params.id, request.body.content, request.user!); response.status(201).json({ item: store.comments.at(-1) }); }));
  app.get("/api/admin/xinsj", requireAdmin, route(async (_request, response) => { response.setHeader("Cache-Control", "no-store"); response.json(await loadChip()); }));
  app.put("/api/admin/xinsj/settings", requireAdmin, route(async (request, response) => { response.json(await saveChipSettings(request.body.settings, request.body.revision)); }));
  app.post("/api/admin/xinsj/posts", requireAdmin, route(async (request, response) => { response.status(201).json(await saveChipPost(request.body.item, request.user!)); }));
  app.put("/api/admin/xinsj/posts/:id", requireAdmin, route(async (request, response) => { response.json(await saveChipPost(request.body.item, request.user!, request.params.id, request.body.revision)); }));
  app.delete("/api/admin/xinsj/posts/:id", requireAdmin, route(async (request, response) => { response.json(await deleteChipPost(request.params.id, request.user!, request.body.revision)); }));
  app.put("/api/admin/xinsj/comments/:id", requireAdmin, route(async (request, response) => { response.json(await moderateChipComment(request.params.id, request.body.status, request.body.revision)); }));
  app.delete("/api/admin/xinsj/comments/:id", requireAdmin, route(async (request, response) => { response.json(await moderateChipComment(request.params.id, null, request.body.revision, true)); }));
  app.get(["/xinsj", "/xinsj/", "/xinsj/admin", "/xinsj/admin/*", "/xinsj/post/:id"], route(async (request, response) => {
    const admin = /^\/xinsj\/admin(?:\/|$)/.test(request.path); response.setHeader("Cache-Control", "no-store");
    if (!admin && !await pluginEnabled("alumxinsj")) { response.status(503).type("html").send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>模块暂未启用</title><h1>Alum芯世界暂未启用</h1><a href="/">返回工作台</a></html>'); return; }
    const store = await loadChip(); const post = request.params.id ? store.posts.find((item) => item.id === request.params.id && item.status === "published") : undefined;
    const missing = !!request.params.id && !post; const title = post ? `${post.title} · ${store.settings.name}` : `${store.settings.name}${admin ? " · 管理后台" : " · 半导体工艺制造社区"}`;
    const origin = siteOrigin(await loadSettings(), request); const head = `<!--alum4k:head:start--><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(post?.content.slice(0, 150) || store.settings.description)}"><meta name="robots" content="${admin || missing ? "noindex, nofollow" : "index, follow"}"><link rel="canonical" href="${escapeHtml(origin + (admin ? "/xinsj/admin" : post ? "/xinsj/post/" + post.id : "/xinsj"))}"><link rel="icon" href="/xinsj.svg"><!--alum4k:head:end-->`;
    const content = admin ? "<h1>Alum芯世界 管理员登录</h1>" : missing ? "<h1>帖子不存在或尚未发布</h1>" : post ? `<h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.content)}</p>` : `<h1>${escapeHtml(store.settings.name)}</h1><p>${escapeHtml(store.settings.description)}</p>${store.posts.filter((post) => post.status === "published").slice(0, 50).map((post) => `<article><h2><a href="/xinsj/post/${post.id}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.content.slice(0, 240))}</p></article>`).join("")}`;
    const html = (await readFile(path.resolve(process.cwd(), "dist/index.html"), "utf8")).replace(/<!--alum4k:head:start-->[\s\S]*?<!--alum4k:head:end-->/, () => head).replace(/<!--alum4k:content:start-->[\s\S]*?<!--alum4k:content:end-->/, () => `<!--alum4k:content:start--><main class="seo-content">${content}</main><!--alum4k:content:end-->`);
    response.status(missing ? 404 : 200).type("html").send(html);
  }));
}
