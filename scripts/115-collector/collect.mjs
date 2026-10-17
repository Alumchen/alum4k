import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile, open, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { addMagnets, cleanContext, libraryDraft, validateCollection } from "./core.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export function optionsFrom(args) {
  const options = { exe: "G:\\115-Desktop\\115-Desktop.exe", output: path.join(projectRoot, "data/115-collector"), context: {}, duration: 0 };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]; if (flag === "--help") { options.help = true; continue; }
    if (!["--exe", "--output", "--input", "--title", "--year", "--category", "--type", "--duration"].includes(flag) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Unknown or incomplete option: ${flag}`);
    const value = args[++index];
    if (["--exe", "--output", "--input"].includes(flag)) options[flag.slice(2)] = path.resolve(value);
    else if (flag === "--duration") { options.duration = Number(value); if (!Number.isSafeInteger(options.duration) || options.duration < 1 || options.duration > 86400) throw new Error("Duration must be 1-86400 seconds."); }
    else options.context[flag === "--type" ? "mediaType" : flag.slice(2)] = value;
  }
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
  console.log("115 磁力收集器（半自动，不点击、不翻页、不上传）\n用法：npm run collect:115 -- --title 影视名 --year 2026\n可选：--exe 程序路径 --output 保存目录 --input 本地TXT --duration 运行秒数\n      --category 电影/电视剧/综艺/动漫/少儿/短剧/纪录片/游戏 --type movie/tv\n只接收该软件在前台时新复制的 SHA-1 BTIH 磁力；启动前的剪贴板不会读取。\n命令：/title 新片名（清空年份和资源描述） /year 年份 /resource 资源名称\n      /size 大小 /quality 2160p / 4K（也可 1080p、720p、480p、其他）\n      /status /export /quit\n未设置片名的链接只进入收集记录，不进入媒体库导入草稿。Ctrl+C 退出。");
}
export async function main(args = process.argv.slice(2)) {
  const options = optionsFrom(args);
  if (options.help) { help(); return; }
  if (!options.input && process.platform !== "win32") throw new Error("实时剪贴板收集只支持 Windows；其他系统可用 --input 导入 TXT。");
  if (!options.input && (!(await stat(options.exe)).isFile() || !options.exe.toLowerCase().endsWith(".exe"))) throw new Error("请指定正确的 115-Desktop.exe 路径。");
  const collection = await openCollection(options.output);
  let child; let commands; let stopping = false; let fatal;
  const stop = () => { stopping = true; child?.kill(); commands?.close(); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    if (options.input) {
      if ((await stat(options.input)).size > 10 * 1024 * 1024) throw new Error("TXT 最大支持 10 MB。");
      const added = await collection.add((await readFile(options.input, "utf8")).split(/\r?\n/), options.context);
      await collection.export(); console.log(`已导入 ${added.length} 条新磁力，共 ${collection.records.length} 条。保存位置：${options.output}`); return;
    }
    await collection.export();
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-File", fileURLToPath(new URL("./watch-clipboard.ps1", import.meta.url)), "-TargetExe", options.exe, "-ParentProcessId", String(process.pid), "-DurationSeconds", String(options.duration)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const finished = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (code) => stopping || code === 0 ? resolve() : reject(new Error("剪贴板助手退出失败，请确认软件路径和 Windows PowerShell 可用。"))); });
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
        const key = { title: "title", year: "year", resource: "resourceTitle", size: "size", quality: "quality" }[command];
        if (!key) { console.log("未知命令，使用 /status、/title、/year、/resource、/size、/quality、/export、/quit。"); return; }
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
        console.log(added.length ? `已保存 ${added.length} 条，共 ${collection.records.length} 条。` : "重复或非标准磁力，未新增。");
      }
    }
    await finished; if (fatal) throw fatal;
  } finally { stop(); await collection.close(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
