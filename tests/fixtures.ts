import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const adminPassword = "test-admin-password";
export const panUrl = "https://115.com/s/testdownload";
export const magnetUrl = `magnet:?xt=urn:btih:${"a".repeat(40)}`;

export async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

export async function startTestApi() {
  const directory = await mkdtemp(path.join(tmpdir(), "alum4k-test-"));
  await mkdir(path.join(directory, "data"));
  await mkdir(path.join(directory, "dist"));
  await writeFile(path.join(directory, "dist", "index.html"), '<html><head><!--alum4k:head:start--><title>Alum4K</title><!--alum4k:head:end--><script src="/assets/test.js"></script></head><body><div id="root"></div></body></html>');
  const movie = {
    id: "test-movie", tmdbId: 123456, mediaType: "movie", title: "验证电影", originalTitle: "Test Movie", year: 2024,
    category: "电影", region: "内地", access: "会员", status: "正片", rating: 8.5, genres: ["喜剧"], cast: ["测试演员"],
    overview: "影视资料和下载链接验证。", posterPath: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
    backdropPath: "https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
    source: { provider: "115", type: "direct", directUrl: "https://private.invalid/video" },
    episodes: [{ id: "main", title: "正片", source: { provider: "115", type: "alist", path: "/private/movie.mp4" } }],
    resources: [
      { id: "old-alist", type: "115", title: "旧路径", url: "/电影/旧路径.mp4" },
      { id: "pan", type: "115", title: "4K 原盘", url: panUrl, code: "abcd", size: "18 GB" },
      { id: "magnet", type: "magnet", title: "磁力资源", url: magnetUrl }
    ]
  };
  await writeFile(path.join(directory, "data", "library.json"), JSON.stringify([movie, { ...movie, id: "empty", title: "暂无资源", tmdbId: 789012, source: undefined, resources: [], episodes: [] }]));
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", pathToFileURL(path.join(projectRoot, "node_modules/tsx/dist/loader.mjs")).href, path.join(projectRoot, "server/index.ts")], {
    cwd: directory,
    env: { ...process.env, API_PORT: String(port), ADMIN_PASSWORD: adminPassword, AUTH_SECRET: "isolated-test-secret", TMDB_BEARER_TOKEN: "", TMDB_API_KEY: "", ALIST_BASE_URL: "", ALIST_TOKEN: "" },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  const base = `http://127.0.0.1:${port}`;
  async function close() {
    if (child.exitCode === null) {
      const ended = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill(); await ended;
    }
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + "alum4k-test-")) throw new Error("Unexpected test directory; refusing cleanup.");
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) { await close(); throw new Error(logs); }
    try { if ((await fetch(`${base}/api/health`)).ok) return { base, child, directory, close }; } catch { /* Wait for API startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await close(); throw new Error(`API startup timed out: ${logs}`);
}
