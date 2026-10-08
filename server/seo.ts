import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { SiteSettings } from "../shared/site";

const file = path.resolve(process.cwd(), "dist", "index.html");
const startMarker = "<!--alum4k:head:start-->";
const endMarker = "<!--alum4k:head:end-->";
import { pageMetadata } from "../shared/seo";
import { mediaPath } from "../shared/catalog";
import type { MediaItem } from "./types";
import type { Request } from "express";
export function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
export function siteOrigin(settings: SiteSettings, request: Request) {
  if (settings.seo.siteUrl) return settings.seo.siteUrl;
  const origin = new URL(`${request.protocol === "https" ? "https" : "http"}://${request.get("host") || "localhost"}`);
  return origin.origin;
}
function replaceHead(html: string, settings: SiteSettings, item?: MediaItem, origin = settings.seo.siteUrl || "", missing = false) {
  const start = html.indexOf(startMarker); const end = html.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error("首页缺少 SEO 模板标记，请重新构建前端。");
  const metadata = pageMetadata(settings, item, missing); const title = escapeHtml(metadata.title); const description = escapeHtml(metadata.description);
  const canonical = escapeHtml(origin + metadata.path);
  const head = `${startMarker}\n<title>${title}</title>\n<meta name="description" content="${description}">\n<meta name="robots" content="${metadata.robots}">\n<link rel="canonical" href="${canonical}">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${description}">\n<meta property="og:url" content="${canonical}">\n${metadata.image ? `<meta property="og:image" content="${escapeHtml(metadata.image)}">\n` : ""}<link rel="icon" href="${escapeHtml(settings.branding.logo || "/brand.svg")}">\n${endMarker}`;
  return html.slice(0, start) + head + html.slice(end + endMarker.length);
}
export async function renderPublicPage(settings: SiteSettings, origin: string, item?: MediaItem, missing = false) {
  let html = replaceHead(await readFile(file, "utf8"), settings, item, origin, missing);
  const content = item ? `<article class="seo-content"><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml([item.category, String(item.year ?? ""), item.region, ...item.genres].filter(Boolean).join(" · "))}</p><p>${escapeHtml(item.overview)}</p><p>主演：${escapeHtml(item.cast.join(" / "))}</p><p>${item.resources?.length ?? 0} 个下载资源</p><a href="/">返回影视目录</a></article>`
    : missing ? '<main class="seo-content"><h1>影视不存在</h1><p>该影视不存在或已经删除。</p><a href="/">返回首页</a></main>' : '<main class="seo-content"><h1>影视目录</h1></main>';
  html = html.replace(/<!--alum4k:content:start-->[\s\S]*?<!--alum4k:content:end-->/, () => `<!--alum4k:content:start-->${content}<!--alum4k:content:end-->`);
  return html;
}
export function renderSitemap(origin: string, items: MediaItem[], page = 1) {
  const count = Math.max(1, Math.ceil((items.length + 1) / 10000));
  if (!Number.isInteger(page) || page < 1 || page > count) return null;
  const locations = [{ path: "/", date: "" }, ...items.map((item) => ({ path: mediaPath(item), date: item.updatedAt || item.createdAt || "" }))].slice((page - 1) * 10000, page * 10000);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map(({ path, date }) => `<url><loc>${escapeHtml(origin + path)}</loc>${Number.isFinite(Date.parse(date)) ? `<lastmod>${new Date(date).toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}
export function renderSitemapIndex(origin: string, count: number) {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: Math.max(1, Math.ceil((count + 1) / 10000)) }, (_, index) => `<sitemap><loc>${escapeHtml(origin)}/sitemap-${index + 1}.xml</loc></sitemap>`).join("")}</sitemapindex>`;
}
export async function syncSiteHead(settings: SiteSettings) {
  let html: string;
  try { html = await readFile(file, "utf-8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  const start = html.indexOf(startMarker); const end = html.indexOf(endMarker);
  if (start < 0 || end < start) return;
  const next = replaceHead(html, settings);
  if (next === html) return;
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, next, { encoding: "utf-8", mode: 0o644 }); await rename(temporary, file);
}
