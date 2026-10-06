import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { defaultSettings, themes, type SiteSettings } from "../shared/site";

const settingsFile = path.resolve(process.cwd(), "data", "site-settings.json");
let pendingWrite: Promise<unknown> = Promise.resolve();

export async function loadSettings(): Promise<SiteSettings> {
  try {
    const stored = JSON.parse(await readFile(settingsFile, "utf-8"));
    return { branding: { ...defaultSettings.branding, ...stored.branding }, announcement: { ...defaultSettings.announcement, ...stored.announcement } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaultSettings);
    throw error;
  }
}

function normalizeLogo(input: unknown) {
  if (input === "") return "";
  if (typeof input !== "string" || input.length > 1400000) throw new Error("Logo 需为不超过 1 MB 的 PNG、JPEG 或 WebP 图片。");
  const match = input.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error("Logo 只支持 PNG、JPEG 或 WebP 图片，不支持 SVG 或外部链接。");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString("base64") !== match[2]) throw new Error("Logo 图片格式或大小不正确。");
  const valid = match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new Error("Logo 文件内容与图片类型不符。");
  return input;
}

export function saveSettings(input: unknown) {
  const next = pendingWrite.then(() => persistSettings(input));
  pendingWrite = next.catch(() => undefined);
  return next;
}

async function persistSettings(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("站点配置不正确。");
  const payload = input as { announcement?: Record<string, unknown>; branding?: Record<string, unknown> };
  const settings = await loadSettings();
  if (payload.branding) {
    const raw = payload.branding;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name || name.length > 24 || /[<>\x00-\x1f]/.test(name)) throw new Error("网站名称需为 1-24 个字符，不能包含控制字符或尖括号。");
    if (!themes.some((theme) => theme.value === raw.theme)) throw new Error("请选择有效的网站主题。");
    settings.branding = { name, logo: normalizeLogo(raw.logo), theme: raw.theme as SiteSettings["branding"]["theme"] };
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
  if (!payload.announcement && !payload.branding) throw new Error("请提供站点或公告配置。");
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const temporaryFile = `${settingsFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  await rename(temporaryFile, settingsFile);
  return settings;
}
