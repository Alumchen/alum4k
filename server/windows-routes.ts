import type { Express } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "./auth";
import { pluginEnabled } from "./workbench";
import { loadSettings } from "./settings";
import { escapeHtml, siteOrigin } from "./seo";
import { collectWindowsSource } from "./windows-source";
import { loadWindows, saveWindowsResource, deleteWindowsResource, saveWindowsSettings, saveWindowsCategories, importWindows, WindowsConflict } from "./windows";

export function addWindowsRoutes(app: Express) {
  app.get("/api/windows", async (_request, response, next) => { try { if (!await pluginEnabled("alumwindows")) { response.status(503).json({ message: "AlumWindows 模块暂未启用。" }); return; } const store = await loadWindows(); response.json({ ...store, items: store.items.filter((item) => item.published) }); } catch (error) { next(error); } });
  app.get("/api/admin/windows", requireAdmin, async (_request, response, next) => { try { response.json(await loadWindows()); } catch (error) { next(error); } });
  const failure = (response: import("express").Response, error: unknown) => response.status(error instanceof WindowsConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "保存失败。" });
  app.post("/api/admin/windows/resources", requireAdmin, async (request, response) => { try { response.status(201).json((await saveWindowsResource(request.body.item, request.body.revision)).store); } catch (error) { failure(response, error); } });
  app.put("/api/admin/windows/resources/:id", requireAdmin, async (request, response) => { try { response.json((await saveWindowsResource(request.body.item, request.body.revision, request.params.id)).store); } catch (error) { failure(response, error); } });
  app.delete("/api/admin/windows/resources/:id", requireAdmin, async (request, response) => { try { response.json((await deleteWindowsResource(request.params.id, request.body.revision)).store); } catch (error) { failure(response, error); } });
  app.put("/api/admin/windows/settings", requireAdmin, async (request, response) => { try { response.json((await saveWindowsSettings(request.body.settings, request.body.revision)).store); } catch (error) { failure(response, error); } });
  app.put("/api/admin/windows/categories", requireAdmin, async (request, response) => { try { response.json((await saveWindowsCategories(request.body.categories, request.body.revision)).store); } catch (error) { failure(response, error); } });
  app.post("/api/admin/windows/import", requireAdmin, async (request, response) => { try { if (!["merge", "replace"].includes(request.body.mode)) throw new Error("请选择合并或替换导入。"); response.json((await importWindows(request.body.store, request.body.revision, request.body.mode)).store); } catch (error) { failure(response, error); } });
  let collecting = false;
  app.post("/api/admin/windows/collect", requireAdmin, async (request, response) => { if (collecting) { response.status(429).json({ message: "正在采集，请稍后重试。" }); return; } collecting = true; try { const source = await collectWindowsSource(); response.json((await importWindows(source, request.body.revision, "merge")).store); } catch (error) { failure(response, error); } finally { collecting = false; } });
  app.get(["/windows", "/windows/", "/windows/admin", "/windows/admin/*", "/windows/faq"], async (request, response, next) => {
    try {
      const admin = /^\/windows\/admin(?:\/|$)/.test(request.path); const enabled = await pluginEnabled("alumwindows");
      response.setHeader("Cache-Control", "no-store");
      if (!admin && !enabled) { response.status(503).type("html").send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模块暂未启用</title><h1>AlumWindows 模块暂未启用</h1><a href="/">返回工作台</a></html>'); return; }
      const store = await loadWindows(); const origin = siteOrigin(await loadSettings(), request); const title = store.settings.name + (admin ? " · 管理后台" : request.path.endsWith("/faq") ? " · 常见问题" : " · 系统软件资源仓储");
      const head = `<!--alum4k:head:start--><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(store.settings.description)}"><meta name="robots" content="${admin ? "noindex, nofollow" : "index, follow"}"><link rel="canonical" href="${escapeHtml(origin + (admin ? "/windows/admin" : request.path.endsWith("/faq") ? "/windows/faq" : "/windows"))}"><link rel="icon" href="/windows.svg"><!--alum4k:head:end-->`;
      const content = admin ? '<h1>AlumWindows 管理员登录</h1>' : `<h1>${escapeHtml(store.settings.name)}</h1><p>${escapeHtml(store.settings.description)}</p>${store.items.filter((item) => item.published).map((item) => `<article><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.category)} · ${escapeHtml(item.architecture)} · ${escapeHtml(item.date)}</p></article>`).join("")}`;
      const html = (await readFile(path.resolve(process.cwd(), "dist/index.html"), "utf8")).replace(/<!--alum4k:head:start-->[\s\S]*?<!--alum4k:head:end-->/, () => head).replace(/<!--alum4k:content:start-->[\s\S]*?<!--alum4k:content:end-->/, () => `<!--alum4k:content:start--><main class="seo-content">${content}</main><!--alum4k:content:end-->`);
      response.type("html").send(html);
    } catch (error) { next(error); }
  });
}
