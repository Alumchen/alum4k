import type { Express } from "express";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "./auth";
import { loadDashboard, saveDashboard, DashboardConflict } from "./dashboard";
import { installedPlugins } from "../shared/workbench";
import { loadWorkbench, saveWorkbench, mediaPluginEnabled } from "./workbench";
import { loadSettings } from "./settings";
import { renderWorkbenchPage } from "./workbench-pages";
import { siteOrigin, escapeHtml } from "./seo";

export function addWorkbenchRoutes(app: Express) {
  app.get("/api/workbench/me", requireAuth, async (request: AuthenticatedRequest, response, next) => { try { response.json(await loadDashboard(request.user!.username)); } catch (error) { next(error); } });
  app.put("/api/workbench/me", requireAuth, async (request: AuthenticatedRequest, response) => { try { response.json(await saveDashboard(request.user!.username, request.body)); } catch (error) { response.status(error instanceof DashboardConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "保存失败。" }); } });
  app.get("/api/workbench", async (_request, response, next) => { try { const store = await loadWorkbench(); response.json({ settings: store.settings, plugins: installedPlugins(store).filter((plugin) => plugin.enabled) }); } catch (error) { next(error); } });
  app.get("/api/admin/workbench", requireAdmin, async (_request, response, next) => { try { const store = await loadWorkbench(); response.json({ ...store, installed: installedPlugins(store) }); } catch (error) { next(error); } });
  app.put("/api/admin/workbench", requireAdmin, async (request, response) => { try { const store = await saveWorkbench(request.body); response.json({ ...store, installed: installedPlugins(store) }); } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "保存失败。" }); } });
  app.get(["/", "/admin", "/admin/*"], async (request, response, next) => { try { const settings = await loadSettings(); response.setHeader("Cache-Control", "no-store"); response.type("html").send(await renderWorkbenchPage(siteOrigin(settings, request), request.path !== "/")); } catch (error) { next(error); } });
  app.get("/sitemap.xml", async (request, response, next) => {
    try {
      const settings = await loadSettings(); const origin = siteOrigin(settings, request);
      response.setHeader("Cache-Control", "no-store");
      response.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${escapeHtml(origin)}/workbench-sitemap.xml</loc></sitemap>${settings.access.requireLogin || !await mediaPluginEnabled() ? "" : `<sitemap><loc>${escapeHtml(origin)}/yingshi/sitemap.xml</loc></sitemap>`}</sitemapindex>`);
    } catch (error) { next(error); }
  });
  app.get("/workbench-sitemap.xml", async (request, response, next) => { try { const origin = siteOrigin(await loadSettings(), request); response.setHeader("Cache-Control", "no-store"); response.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(origin)}/</loc></url></urlset>`); } catch (error) { next(error); } });
}
