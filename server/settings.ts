import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { defaultSettings, themes, type SiteSettings } from "../shared/site";
import { validateImage } from "./images";
import { syncSiteHead } from "./seo";

const settingsFile = path.resolve(process.cwd(), "data", "site-settings.json");
let pendingWrite: Promise<unknown> = Promise.resolve();

export async function loadSettings(): Promise<SiteSettings> {
  try {
    const stored = JSON.parse(await readFile(settingsFile, "utf-8"));
    return { branding: { ...defaultSettings.branding, ...stored.branding }, announcement: { ...defaultSettings.announcement, ...stored.announcement }, seo: { ...defaultSettings.seo, ...stored.seo }, bulletins: stored.bulletins ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaultSettings);
    throw error;
  }
}

export function saveSettings(input: unknown) {
  const next = pendingWrite.then(() => persistSettings(input));
  pendingWrite = next.catch(() => undefined);
  return next;
}

async function persistSettings(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("站点配置不正确。");
  const payload = input as { announcement?: Record<string, unknown>; branding?: Record<string, unknown>; seo?: Record<string, unknown>; bulletins?: unknown };
  const settings = await loadSettings();
  if (payload.branding) {
    const raw = payload.branding;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name || name.length > 24 || /[<>\x00-\x1f]/.test(name)) throw new Error("网站名称需为 1-24 个字符，不能包含控制字符或尖括号。");
    if (!themes.some((theme) => theme.value === raw.theme)) throw new Error("请选择有效的网站主题。");
    settings.branding = { name, logo: validateImage(raw.logo, "Logo"), theme: raw.theme as SiteSettings["branding"]["theme"] };
  }
  if (payload.seo) {
    const text = (key: string, max: number) => { const value = typeof payload.seo![key] === "string" ? String(payload.seo![key]).trim() : ""; if (value.length > max || /[\x00-\x1f]/.test(value)) throw new Error("浏览器标题或站点介绍超出长度限制或含控制字符。"); return value; };
    settings.seo = { title: text("title", 80), adminTitle: text("adminTitle", 80), description: text("description", 240) };
  }
  if (payload.bulletins !== undefined) {
    if (!Array.isArray(payload.bulletins) || payload.bulletins.length > 20) throw new Error("公告栏最多发布 20 条内容。");
    const ids = new Set<string>();
    settings.bulletins = payload.bulletins.map((raw) => {
      if (!raw || typeof raw !== "object") throw new Error("公告栏内容不正确。");
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      const content = typeof raw.content === "string" ? raw.content.trim() : "";
      const id = typeof raw.id === "string" && raw.id.length <= 80 ? raw.id : crypto.randomUUID();
      if (!title || title.length > 80 || content.length > 2000 || ids.has(id)) throw new Error("请检查公告标题、正文长度或重复编号。");
      ids.add(id);
      let link = typeof raw.link === "string" ? raw.link.trim() : "";
      if (link) { const url = new URL(link); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || link.length > 2000) throw new Error("公告或广告链接须为有效的 HTTP/HTTPS 地址。"); link = url.href; }
      return { id, title, content, link, type: raw.type === "advertisement" ? "advertisement" : "announcement", enabled: raw.enabled === true, image: validateImage(raw.image ?? "", "公告图片", 256 * 1024) };
    });
  }
  if (payload.announcement) {
    const raw = payload.announcement;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (!title || title.length > 80) throw new Error("公告标题需为 1-80 个字符。");
    if (content.length > 3000 || (raw.enabled === true && !content)) throw new Error("启用公告时请填写正文，最多 3000 个字符。");
    const announcement: Omit<SiteSettings["announcement"], "revision"> = {
      enabled: raw.enabled === true, title, content,
      frequency: raw.frequency === "daily" || raw.frequency === "always" ? raw.frequency : "session"
    };
    const unchanged = Object.entries(announcement).every(([key, value]) => settings.announcement[key as keyof typeof announcement] === value);
    settings.announcement = { ...announcement, revision: unchanged ? settings.announcement.revision : crypto.randomUUID() };
  }
  if (!payload.announcement && !payload.branding && !payload.seo && payload.bulletins === undefined) throw new Error("请提供站点或公告配置。");
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const temporaryFile = `${settingsFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  await rename(temporaryFile, settingsFile);
  await syncSiteHead(settings);
  return settings;
}
