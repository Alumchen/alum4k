import { spawn } from "node:child_process";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { magnetLinks } from "./core.mjs";
import { inspectMetadata, maximumMetadataBytes } from "./metadata.mjs";

export function ariaArguments(hash, directory, seconds) {
  if (!/^[a-f0-9]{40}$/.test(hash) || !Number.isInteger(seconds) || seconds < 5 || seconds > 300) throw new Error("Invalid verification options.");
  // No caller-provided trackers, web seeds, configuration files or RPC endpoint.
  return ["--no-conf=true", "--no-netrc=true", "--enable-rpc=false", "--bt-metadata-only=true", "--bt-save-metadata=true", "--bt-load-saved-metadata=false", "--follow-torrent=false", "--seed-time=0", "--file-allocation=none", "--enable-dht=true", "--enable-dht6=false", "--bt-enable-lpd=false", "--enable-peer-exchange=true", "--listen-port=49152-65535", "--dht-listen-port=49152-65535", `--dht-file-path=${path.join(directory, "dht.dat")}`, `--stop=${seconds}`, `--bt-stop-timeout=${seconds}`, "--summary-interval=0", "--console-log-level=error", `--dir=${directory}`, `magnet:?xt=urn:btih:${hash}`];
}
export function runAria(executable, args, milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: "ignore", shell: false });
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(kill, milliseconds);
    signal?.addEventListener("abort", kill, { once: true });
    if (signal?.aborted) kill();
    child.once("error", () => { clearTimeout(timer); signal?.removeEventListener("abort", kill); reject(new Error("无法启动 aria2c，请安装或使用 --aria2 指定可执行文件。")); });
    child.once("close", (code) => { clearTimeout(timer); signal?.removeEventListener("abort", kill); resolve(code); });
  });
}
export async function checkAria(executable = "aria2c") {
  if (await runAria(executable, ["--no-conf=true", "--version"], 5000) !== 0) throw new Error("aria2c 不可用，已停止上传。");
}
export async function verifyMagnet(record, { executable = "aria2c", seconds = 60, signal, run = runAria } = {}) {
  const links = magnetLinks(record?.magnet);
  if (links.length !== 1 || links[0].magnet !== record.magnet || links[0].hash !== record.hash) return { status: "invalid", reason: "磁力格式或哈希不正确" };
  const directory = await mkdtemp(path.join(tmpdir(), "alum4k-metadata-"));
  try {
    const code = await run(executable, ariaArguments(record.hash, directory, seconds), (seconds + 3) * 1000, signal);
    if (signal?.aborted) return { status: "unknown", reason: "检测已取消" };
    const file = path.join(directory, `${record.hash}.torrent`);
    let bytes;
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > maximumMetadataBytes) return { status: "invalid", reason: "种子元数据过大或格式异常" };
      bytes = await readFile(file);
    } catch (error) {
      if (error.code === "ENOENT") return { status: "unknown", reason: code === 0 ? "未取得种子元数据" : "超时、无可用节点或网络受限" };
      throw error;
    }
    try {
      const metadata = await inspectMetadata(record.magnet, bytes);
      return { status: "verified", checkedAt: new Date().toISOString(), metadata, torrent: bytes.toString("base64") };
    } catch { return { status: "invalid", reason: "种子元数据与磁力哈希不匹配或格式异常" }; }
  } finally {
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + "alum4k-metadata-")) throw new Error("Unexpected metadata directory.");
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
