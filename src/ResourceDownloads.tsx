import { Check, Copy, Flag, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { resourceDisplayMetadata } from "../shared/resources";
import { reportReasons } from "../shared/reports";
import { reportResource } from "./api";
import { copyText } from "./clipboard";
import { resourceHref } from "../shared/media";
import Dialog from "./Dialog";
import type { DownloadResource } from "./types";

export function ResourceSummary({ resource }: { resource: DownloadResource }) {
  const metadata = resourceDisplayMetadata(resource);
  const extras = [resource.code ? `提取码：${resource.code}` : "", resource.subtitles ? `字幕：${resource.subtitles}` : "", resource.audio ? `音轨：${resource.audio}` : "", resource.note].filter(Boolean);
  return <div className="resource-metadata"><span className="resource-meta-size" title="大小">{metadata.size}</span><span className="resource-meta-quality" title="画质">{metadata.quality}</span><span className="resource-meta-date" title="更新时间">{metadata.updated}</span>{extras.map((value, index) => <span className="resource-meta-extra" key={index}>{value}</span>)}</div>;
}
function ReportDialog({ resource, mediaId, onClose }: { resource: DownloadResource; mediaId: string; onClose: () => void }) {
  const [reason, setReason] = useState<typeof reportReasons[number]>("链接失效"); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await reportResource(mediaId, resource.id, reason, note); setSent(true); }
    catch (error) { setError(error instanceof Error ? error.message : "反馈失败。"); } finally { setBusy(false); }
  }
  return <Dialog title="资源反馈" onClose={() => { if (!busy) onClose(); }}>
    {sent ? <><p className="form-success" role="status">反馈已提交，管理员将核验处理。</p><button type="button" className="primary-action" onClick={onClose}><Check size={16} />完成</button></> : <form className="auth-fields" onSubmit={submit}>
      <p>{resource.title}</p><label>反馈原因<select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} disabled={busy}>{reportReasons.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>反馈说明<textarea aria-label="反馈说明" maxLength={500} rows={4} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}<button type="submit" className="primary-action" disabled={busy}><Send size={16} />{busy ? "提交中…" : "提交反馈"}</button>
    </form>}
  </Dialog>;
}
export default function DownloadLink({ resource, mediaId }: { resource: DownloadResource; mediaId: string }) {
  const [copied, setCopied] = useState(false); const [error, setError] = useState(""); const [reportOpen, setReportOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(); const href = resourceHref(resource.url);
  const name = href && resource.title.trim() && !["115网盘", "磁力链接"].includes(resource.title.trim()) ? resource.title : resource.url;
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    setError("");
    try { await copyText(resource.type === "115" && resource.code ? `${resource.url}\n提取码：${resource.code}` : resource.url); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000); }
    catch (error) { setError(error instanceof Error ? error.message : "复制失败。"); }
  }
  return <div className="download-row resource-link-row">
    <div className="resource-link-info">
      <div className="resource-url-line"><div className="resource-link-heading">{href ? <a href={href} target="_blank" rel="noreferrer" title={resource.url}>{name}</a> : <span className="resource-plain-text">{resource.url}</span>}<span className={`resource-access ${resource.access === "free" ? "free" : "vip"}`}>{resource.access === "free" ? "免费" : "VIP"}</span></div>
        <div className="resource-row-tools">
        <button type="button" className="copy-link-button" onClick={copy} title={copied ? "已复制" : resource.code ? "复制链接和提取码" : "复制链接"} aria-label={copied ? "已复制链接" : "复制链接"}>{copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "已复制" : "复制"}</span></button>
        <button className="resource-report-button" type="button" title="失效反馈" aria-label="失效反馈" onClick={() => setReportOpen(true)}><Flag size={15} /></button></div>
      </div><ResourceSummary resource={resource} />
      {error ? <small className="form-error" role="alert">{error}</small> : null}
    </div>
    {reportOpen ? <ReportDialog resource={resource} mediaId={mediaId} onClose={() => setReportOpen(false)} /> : null}
  </div>;
}
