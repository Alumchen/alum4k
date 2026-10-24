import { readFile } from "node:fs/promises";
import path from "node:path";
import { installedPlugins } from "../shared/workbench";
import { loadWorkbench } from "./workbench";

function escape(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
export async function workbenchPageHtml(html: string, origin: string, admin = false) {
  const store = await loadWorkbench(); const settings = store.settings;
  const title = admin ? `工作台管理 · ${settings.name}` : settings.name;
  const canonical = origin + (admin ? "/admin" : "/");
  const head = `<!--alum4k:head:start-->\n<title>${escape(title)}</title>\n<meta name="description" content="${escape(settings.description)}">\n<meta name="robots" content="${admin ? "noindex, nofollow" : "index, follow"}">\n<link rel="canonical" href="${escape(canonical)}">\n<meta property="og:title" content="${escape(title)}">\n<meta property="og:description" content="${escape(settings.description)}">\n<meta property="og:url" content="${escape(canonical)}">\n<link rel="icon" href="/brand.svg">\n<!--alum4k:head:end-->`;
  const content = admin ? "<h1>工作台管理员登录</h1>" : `<h1>${escape(settings.name)}</h1><p>${escape(settings.description)}</p>${installedPlugins(store).filter((plugin) => plugin.enabled).map((plugin) => `<article><h2><a href="${escape(plugin.entry)}">${escape(plugin.name)}</a></h2><p>${escape(plugin.description)}</p></article>`).join("")}`;
  return html.replace(/<!--alum4k:head:start-->[\s\S]*?<!--alum4k:head:end-->/, () => head).replace(/<!--alum4k:content:start-->[\s\S]*?<!--alum4k:content:end-->/, () => `<!--alum4k:content:start--><main class="seo-content">${content}</main><!--alum4k:content:end-->`);
}
export async function renderWorkbenchPage(origin: string, admin = false) { return workbenchPageHtml(await readFile(path.resolve(process.cwd(), "dist/index.html"), "utf8"), origin, admin); }
