import { mkdir, readFile, readdir, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { imageSize } from "image-size";
import { aiOwner, AiError } from "./ai";
import type { AiImage, AiImageInput } from "../shared/ai-chat";

const root = path.resolve(process.cwd(), "data/ai/assets");
function safeId(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new AiError("图片不存在。", 404); return id; }
function folder(user: string, chat: string) { return path.join(root, aiOwner(user), safeId(chat)); }
export function decodeAiImages(value: unknown): Array<{ input: AiImageInput; bytes: Buffer }> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new AiError("每次最多上传3张图片。");
  let total = 0;
  return value.map((input: AiImageInput) => {
    if (!input || typeof input.name !== "string" || input.name.length > 120 || typeof input.base64 !== "string" || input.base64.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw new AiError("图片内容或名称不正确。");
    const bytes = Buffer.from(input.base64, "base64"); total += bytes.length;
    if (bytes.length > 3 * 1024 * 1024 || total > 6 * 1024 * 1024) throw new AiError("每张图片不超过3 MB，每次合计不超过6 MB。");
    inspect(bytes, input.mime, false); return { input, bytes };
  });
}
function inspect(bytes: Buffer, mime: string, snapshot: boolean) {
  const kind = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpg" : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : "";
  if (!kind || mime !== ({ png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as Record<string,string>)[kind]) throw new AiError("仅支持真实的 PNG、JPEG、WebP 图片。");
  try { const size = imageSize(bytes); if (!size.width || !size.height || size.type !== kind && !(kind === "jpg" && size.type === "jpeg") || size.width > (snapshot ? 1800 : 8000) || size.height > (snapshot ? 16000 : 8000) || size.width * size.height > 28000000) throw new Error(); return { width: size.width, height: size.height }; } catch { throw new AiError("图片损坏或尺寸过大。"); }
}
export async function saveAiImage(user: string, chat: string, bytes: Buffer, name: string, mime = "image/png", snapshot = false): Promise<AiImage> {
  if (bytes.length > 12 * 1024 * 1024) throw new AiError("回答图片超过保存上限。");
  const size = inspect(bytes, mime, snapshot); const directory = folder(user, chat); const ownerRoot = path.dirname(directory);
  await mkdir(directory, { recursive: true });
  const files = await readdir(ownerRoot, { recursive: true, withFileTypes: true });
  // Bound disk use even when a prior process stopped before recording an attachment.
  let used = 0; for (const entry of files) if (entry.isFile()) used += (await stat(path.join(entry.parentPath, entry.name))).size;
  if (used + bytes.length > 200 * 1024 * 1024) throw new AiError("图片存储已达到200 MB，请删除不需要的本地对话。");
  const id = crypto.randomUUID(); await writeFile(path.join(directory, id), bytes, { mode: 0o600, flag: "wx" });
  return { id, name: name.replace(/[\x00-\x1f]/g, "").slice(0,120), mime, size: bytes.length, ...size };
}
export async function readAiImage(user: string, chat: string, id: string) { return readFile(path.join(folder(user, chat), safeId(id))); }
export async function removeAiImages(user: string, chat: string) { const target = folder(user, chat); if (!target.startsWith(root + path.sep)) throw new Error("Invalid private asset directory"); await rm(target, { recursive: true, force: true }); }
