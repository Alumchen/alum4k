import https from "node:https";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { HttpsProxyAgent } from "https-proxy-agent";
import { validTmdbImage } from "../shared/tmdb-images";

const maximumImageBytes = 6 * 1024 * 1024;
const proxy = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || process.env.ALL_PROXY?.trim();
const agent = proxy ? new HttpsProxyAgent(proxy) : new https.Agent({ keepAlive: true, maxSockets: 6 });
export function imageContentType(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  throw new Error("Unsupported image response.");
}
export function downloadTmdbImage(size: string, file: string): Promise<Buffer> {
  if (!validTmdbImage(size, file)) return Promise.reject(new Error("Invalid image path."));
  return new Promise((resolve, reject) => {
    const request = https.get(`https://image.tmdb.org/t/p/${size}/${file}`, { agent, headers: { Accept: "image/jpeg,image/png,image/webp" } }, (incoming) => {
      if (incoming.statusCode !== 200 || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(incoming.headers["content-type"] || "")) {
        incoming.resume(); request.destroy(new Error("Image upstream unavailable.")); return;
      }
      const chunks: Buffer[] = []; let length = 0;
      incoming.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > maximumImageBytes) { request.destroy(new Error("Image exceeds size limit.")); return; }
        chunks.push(chunk);
      });
      incoming.on("error", reject);
      incoming.on("end", () => {
        try { const bytes = Buffer.concat(chunks); imageContentType(bytes); resolve(bytes); } catch (error) { reject(error); }
      });
    });
    const timeout = setTimeout(() => request.destroy(new Error("Image upstream timed out.")), 12000);
    request.on("close", () => clearTimeout(timeout));
    request.on("error", reject);
  });
}

export function createTmdbImageCache({ directory, maximumBytes, fetchImage = downloadTmdbImage, concurrency = 6, queueLimit = 128 }: {
  directory: string; maximumBytes: number; fetchImage?: (size: string, file: string) => Promise<Buffer>; concurrency?: number; queueLimit?: number;
}) {
  const entries = new Map<string, { bytes: number; accessed: number }>();
  const pending = new Map<string, Promise<Buffer>>();
  const failures = new Map<string, number>();
  let total = 0; let active = 0;
  const waiting: Array<() => void> = [];
  let initialized: Promise<void> | undefined;
  let maintenance = Promise.resolve();
  function initialize() {
    return initialized ??= (async () => {
      await mkdir(directory, { recursive: true });
      for (const name of await readdir(directory)) {
        if (!/^w[0-9]+-[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/.test(name)) continue;
        const info = await stat(path.join(directory, name));
        if (info.isFile()) { entries.set(name, { bytes: info.size, accessed: info.mtimeMs }); total += info.size; }
      }
    })().catch((error) => { initialized = undefined; entries.clear(); total = 0; throw error; });
  }
  function prune() {
    maintenance = maintenance.then(async () => {
      for (const [name, info] of [...entries].sort((a, b) => a[1].accessed - b[1].accessed)) {
        if (total <= maximumBytes) break;
        if (pending.has(name)) continue;
        await unlink(path.join(directory, name)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
        entries.delete(name); total -= info.bytes;
      }
    }).catch(() => undefined);
    return maintenance;
  }
  async function download(size: string, file: string) {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try { return await fetchImage(size, file); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
  async function read(size: string, file: string, name: string) {
    await initialize();
    const target = path.join(directory, name);
    try {
      const bytes = await readFile(target); imageContentType(bytes);
      const previous = entries.get(name);
      if (previous) previous.accessed = Date.now();
      return bytes;
    } catch (error) { if ((error as NodeJS.ErrnoException).code && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const bytes = await download(size, file);
    if (bytes.length > maximumImageBytes) throw new Error("Image exceeds size limit.");
    imageContentType(bytes);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try { await writeFile(temporary, bytes, { mode: 0o644 }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => undefined); }
    total -= entries.get(name)?.bytes || 0;
    entries.set(name, { bytes: bytes.length, accessed: Date.now() }); total += bytes.length;
    return bytes;
  }
  return {
    get(size: string, file: string): Promise<Buffer> {
      if (!validTmdbImage(size, file)) return Promise.reject(new Error("Invalid image path."));
      const name = `${size}-${file}`;
      const existing = pending.get(name); if (existing) return existing;
      if (pending.size >= queueLimit || (failures.get(name) || 0) > Date.now()) return Promise.reject(new Error("Image temporarily unavailable."));
      const promise = read(size, file, name).catch((error) => {
        if (failures.size >= 256) failures.delete(failures.keys().next().value!);
        failures.set(name, Date.now() + 30000); throw error;
      }).finally(async () => { pending.delete(name); await prune(); });
      pending.set(name, promise); return promise;
    }
  };
}

const configuredMegabytes = Number(process.env.TMDB_IMAGE_CACHE_MB || 256);
export const tmdbImages = createTmdbImageCache({ directory: path.resolve("data/cache/tmdb-images"), maximumBytes: (Number.isFinite(configuredMegabytes) ? Math.max(32, Math.min(2048, configuredMegabytes)) : 256) * 1024 * 1024 });
