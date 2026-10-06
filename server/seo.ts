import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { SiteSettings } from "../shared/site";

const file = path.resolve(process.cwd(), "dist", "index.html");
const startMarker = "<!--alum4k:head:start-->";
const endMarker = "<!--alum4k:head:end-->";
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
export async function syncSiteHead(settings: SiteSettings) {
  let html: string;
  try { html = await readFile(file, "utf-8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  const start = html.indexOf(startMarker); const end = html.indexOf(endMarker);
  if (start < 0 || end < start) return;
  const title = escapeHtml(settings.seo.title || settings.branding.name);
  const description = escapeHtml(settings.seo.description);
  const head = `${startMarker}\n<title>${title}</title>\n<meta name="description" content="${description}">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${description}">\n<link rel="icon" href="${escapeHtml(settings.branding.logo || "/brand.svg")}">\n${endMarker}`;
  const next = html.slice(0, start) + head + html.slice(end + endMarker.length);
  if (next === html) return;
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, next, { encoding: "utf-8", mode: 0o644 }); await rename(temporary, file);
}
