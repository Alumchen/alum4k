import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const settingsFile = path.resolve(process.cwd(), "data", "site-settings.json");
const defaults = {
  announcement: { enabled: false, title: "站点公告", content: "", frequency: "session" as "session" | "daily" | "always", revision: "initial" }
};

export async function loadSettings() {
  try {
    return { announcement: { ...defaults.announcement, ...JSON.parse(await readFile(settingsFile, "utf-8")).announcement } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults;
    throw error;
  }
}

export async function saveSettings(input: unknown) {
  const raw = (input as { announcement?: Record<string, unknown> } | null)?.announcement;
  if (!raw) throw new Error("公告配置不正确。");
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!title || title.length > 80) throw new Error("公告标题需为 1-80 个字符。");
  if (content.length > 3000 || (raw.enabled === true && !content)) throw new Error("启用公告时请填写正文，最多 3000 个字符。");
  const settings = { announcement: {
    enabled: raw.enabled === true, title, content,
    frequency: raw.frequency === "daily" || raw.frequency === "always" ? raw.frequency : "session",
    revision: crypto.randomUUID()
  } };
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const temporaryFile = `${settingsFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  await rename(temporaryFile, settingsFile);
  return settings;
}
