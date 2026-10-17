import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { atomicJson, readSession, confirmAdmin, siteRequest } from "./site.mjs";
import { verifyMagnet, checkAria } from "./verify.mjs";

export async function createUploader(directory, { executable, seconds = 60, signal, verify = verifyMagnet, request = siteRequest, session, preflight = true, log = console.log } = {}) {
  const portable = path.join(directory, "tools", process.platform === "win32" ? "aria2c.exe" : "aria2c");
  executable ??= (await stat(portable).catch(() => undefined))?.isFile() ? portable : "aria2c";
  session ??= await readSession(directory);
  if (preflight) { await confirmAdmin(session); await checkAria(executable); }
  const file = path.join(directory, "upload-report.json");
  let report = {};
  try { report = JSON.parse(await readFile(file, "utf8")); if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Invalid report."); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("上传报告损坏，请人工检查，未覆盖原文件。"); }
  let pending = Promise.resolve();
  async function processRecord(record) {
    if (signal?.aborted) return;
    const key = createHash("sha256").update(JSON.stringify([session.site, record.hash, record.mediaId || "", record.title, record.year, record.mediaType, record.seasonNumber])).digest("hex");
    if (report[key]?.status === "uploaded") return;
    let result;
    try {
      if (!record.mediaId && (!record.title || !record.year)) result = { status: "pending", reason: "需要准确片名和年份，或已有影视 ID" };
      else {
        log("正在获取种子元数据，检测通过后才上传…");
        const checked = await verify(record, { executable, seconds, signal });
        if (checked.status !== "verified") result = { status: checked.status, reason: checked.reason };
        else if (!signal?.aborted) {
          const saved = await request(session.site, "/api/admin/collector/import", { token: session.token, body: { ...record, torrent: checked.torrent, checkedAt: checked.checkedAt }, signal });
          if (typeof saved.mediaId !== "string" || typeof saved.added !== "boolean") throw new Error("网站未确认保存结果。");
          result = { status: "uploaded", mediaId: saved.mediaId, added: saved.added };
        }
      }
    } catch (error) { result = { status: "failed", reason: error.status ? `网站拒绝或请求失败（HTTP ${error.status}），未确认上传` : "检测或上传出错，未确认上传；请检查检测器、网络及网站版本" }; }
    if (!result) result = { status: "unknown", reason: "已取消，未确认上传" };
    report[key] = { hash: record.hash, title: record.title, ...result, attemptedAt: new Date().toISOString() };
    await atomicJson(file, report);
    log(result.status === "uploaded" ? result.added ? "检测通过，已上传。" : "网站已有同一磁力，未重复新增。" : `未上传：${result.reason}`);
  }
  return {
    enqueue(records) { const next = pending.then(async () => { for (const record of records) await processRecord(record); }); pending = next; return next; },
    async close() { await pending; }
  };
}
