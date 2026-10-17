import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile, open, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { addMagnets, cleanContext, libraryDraft, validateCollection } from "./core.mjs";
import { createUploader } from "./sync.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export function optionsFrom(args) {
  const options = { exe: "G:\\115-Desktop\\115-Desktop.exe", output: path.join(projectRoot, "data/115-collector"), context: {}, contextOverrides: {}, duration: 0 };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]; if (flag === "--help") { options.help = true; continue; }
    if (flag === "--backfill") { options.existingOnly = true; options.autoUpload = true; continue; }
    if (flag === "--auto-upload" || flag === "--sync") { options[flag === "--sync" ? "sync" : "autoUpload"] = true; continue; }
    if (!["--exe", "--output", "--input", "--title", "--year", "--category", "--type", "--duration", "--aria2", "--timeout", "--media-id", "--season", "--source-date"].includes(flag) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Unknown or incomplete option: ${flag}`);
    const value = args[++index];
    if (["--exe", "--output", "--input"].includes(flag)) options[flag.slice(2)] = path.resolve(value);
    else if (flag === "--duration") { options.duration = Number(value); if (!Number.isSafeInteger(options.duration) || options.duration < 1 || options.duration > 86400) throw new Error("Duration must be 1-86400 seconds."); }
    else if (flag === "--aria2") options.aria2 = value;
    else if (flag === "--timeout") { options.timeout = Number(value); if (!Number.isInteger(options.timeout) || options.timeout < 5 || options.timeout > 300) throw new Error("Timeout must be 5-300 seconds."); }
    else options.context[({ "--type": "mediaType", "--media-id": "mediaId", "--season": "seasonNumber", "--source-date": "sourceUpdatedAt" })[flag] || flag.slice(2)] = value;
  }
  options.contextOverrides = { ...options.context };
  options.context = cleanContext(options.context); return options;
}
async function atomicFile(file, contents) {
  const temporary = `${file}.${process.pid}.tmp`;
  try { await writeFile(temporary, contents, { mode: 0o600 }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => undefined); }
}
export async function openCollection(directory) {
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, ".collector.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`此目录已有收集器运行，或上次异常退出留下锁文件：${lockPath}`); throw error; }
  let records;
  try {
    try { records = validateCollection(JSON.parse(await readFile(path.join(directory, "collection.json"), "utf8"))); }
    catch (error) { if (error.code === "ENOENT") records = []; else throw error; }
    await lock.writeFile(String(process.pid));
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  let pending = Promise.resolve();
  async function save(next) {
    await atomicFile(path.join(directory, "collection.json"), JSON.stringify({ schemaVersion: 1, source: "115-Desktop clipboard", records: next }, null, 2) + "\n");
    records = next;
    await atomicFile(path.join(directory, "magnets.txt"), next.map((item) => item.magnet).join("\n") + (next.length ? "\n" : ""));
    await atomicFile(path.join(directory, "library-import.json"), JSON.stringify(libraryDraft(next), null, 2) + "\n");
  }
  return {
    get records() { return records; },
    add(text, context) {
      const task = pending.then(async () => { const result = addMagnets(records, text, context); if (result.added.length) await save(result.records); return result.added; });
      pending = task.catch(() => undefined); return task;
    },
    export() { const task = pending.then(() => save(records)); pending = task.catch(() => undefined); return task; },
    async close() { await pending; await lock.close(); await unlink(lockPath); }
  };
}
function help() {
  console.log("只补已有影视：--backfill（复制后检测并自动匹配）；已有采集记录用 npm run collect:115:backfill。\n允许追加不同磁力版本，重复哈希跳过；无法唯一匹配或季数不明不入库，不新建影视。");
  console.log("自动检测上传：先 npm run collect:115:login，再使用 --auto-upload；已有记录用 npm run collect:115:sync。\n检测器：--aria2 aria2c路径 --timeout 60（5-300秒）\n目标：--title 准确片名 --year 年份，或 --media-id 已有影视ID；多季影视用 --season 季数。\n可选 --source-date YYYY-MM-DD；未填写时使用网站实际导入日期，不冒充源站更新时间。\n元数据可解析不等于完整影片始终可下载；超时、无节点、无法确认的均跳过上传。");
  console.log("115 磁力收集器（手动复制，默认只保存；--auto-upload 才检测上传）\n用法：npm run collect:115 -- --title 影视名 --year 2026\n可选：--exe 程序路径 --output 保存目录 --input 本地TXT --duration 运行秒数\n      --category 电影/电视剧/综艺/动漫/少儿/短剧/纪录片/游戏 --type movie/tv\n只接收该软件在前台时新复制的 SHA-1 BTIH 磁力；启动前的剪贴板不会读取。\n命令：/title 新片名（清空年份和资源描述） /year 年份 /resource 资源名称\n      /size 大小 /quality 2160p / 4K（也可 1080p、720p、480p、其他）\n      /target 已有影视ID /season 季数 /date 来源日期YYYY-MM-DD\n      /status /export /quit\n未设置片名的链接只进入收集记录，不进入媒体库导入草稿。Ctrl+C 退出。");
}
export async function main(args = process.argv.slice(2)) {
  const options = optionsFrom(args);
  if (options.help) { help(); return; }
  if (!options.input && !options.sync && process.platform !== "win32") throw new Error("实时剪贴板收集只支持 Windows；其他系统可用 --input 导入 TXT。");
  if (!options.input && !options.sync && (!(await stat(options.exe)).isFile() || !options.exe.toLowerCase().endsWith(".exe"))) throw new Error("请指定正确的 115-Desktop.exe 路径。");
  const collection = await openCollection(options.output);
  let child; let childFinished; let commands; let uploader; let stopping = false; let fatal;
  const controller = new AbortController();
  const stop = () => { stopping = true; controller.abort(); child?.kill(); commands?.close(); };
  const enqueue = (records) => uploader?.enqueue(records).catch((error) => { fatal = error; stop(); });
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    if (options.autoUpload || options.sync) uploader = await createUploader(options.output, { executable: options.aria2, seconds: options.timeout, signal: controller.signal, existingOnly: options.existingOnly });
    if (options.sync) { await uploader.enqueue(collection.records.map((record) => ({ ...record, ...cleanContext({ ...record, ...options.contextOverrides }) }))); return; }
    if (options.input) {
      if ((await stat(options.input)).size > 10 * 1024 * 1024) throw new Error("TXT 最大支持 10 MB。");
      const added = await collection.add((await readFile(options.input, "utf8")).split(/\r?\n/), options.context);
      await collection.export(); console.log(`已导入 ${added.length} 条新磁力，共 ${collection.records.length} 条。保存位置：${options.output}`); if (uploader) await uploader.enqueue(collection.records); return;
    }
    await collection.export();
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-File", fileURLToPath(new URL("./watch-clipboard.ps1", import.meta.url)), "-TargetExe", options.exe, "-ParentProcessId", String(process.pid), "-DurationSeconds", String(options.duration)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const finished = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (code) => stopping || code === 0 ? resolve() : reject(new Error("剪贴板助手退出失败，请确认软件路径和 Windows PowerShell 可用。"))); });
    childFinished = finished;
    // Observe rejections immediately while consuming the stdout stream.
    finished.catch(() => undefined);
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    commands = createInterface({ input: process.stdin, terminal: false });
    commands.on("line", (line) => {
      const match = /^\/(\w+)(?:\s+(.*))?$/.exec(line.trim()); if (!match) return;
      const [, command, value = ""] = match;
      try {
        if (command === "quit") { stop(); return; }
        if (command === "status") { console.log(`已收集 ${collection.records.length} 条；当前影视：${options.context.title || "未指定"} ${options.context.year || ""}`); return; }
        if (command === "export") { collection.export().then(() => console.log(`导出已更新：${options.output}`)).catch((error) => { fatal = error; stop(); }); return; }
        const key = { title: "title", year: "year", resource: "resourceTitle", size: "size", quality: "quality", target: "mediaId", season: "seasonNumber", date: "sourceUpdatedAt" }[command];
        if (!key) { console.log("未知命令，使用 /status、/title、/year、/resource、/size、/quality、/target、/season、/date、/export、/quit。"); return; }
        const base = command === "title" ? { category: options.context.category, mediaType: options.context.mediaType } : options.context;
        options.context = cleanContext({ ...base, [key]: value }); console.log(`已更新 ${key}，只应用于此后新复制的磁力。`);
      } catch { console.log("设置未生效，请检查片名、年份或画质取值。"); }
    });
    for await (const line of lines) {
      if (line.length > 20000) continue;
      let event; try { event = JSON.parse(line); } catch { continue; }
      if (event.kind === "ready") { help(); console.log(`正在等待 115-Desktop 中的新复制操作。当前影视：${options.context.title || "未指定"}；已有 ${collection.records.length} 条。\n保存位置：${options.output}`); }
      else if (event.kind === "magnet" && typeof event.value === "string") {
        const added = await collection.add(event.value, options.context);
        enqueue(added);
        console.log(added.length ? `已保存 ${added.length} 条，共 ${collection.records.length} 条。` : "重复或非标准磁力，未新增。");
      }
    }
    await finished; await uploader?.close(); if (fatal) throw fatal;
  } finally { stop(); try { await childFinished?.catch(() => undefined); await uploader?.close(); } finally { await collection.close(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
