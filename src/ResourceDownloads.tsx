import { Check, Copy, ExternalLink, Flag, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { resourceBadges } from "../shared/resources";
import { reportReasons } from "../shared/reports";
import { reportResource } from "./api";
import { copyText } from "./clipboard";
import { resourceHref } from "../shared/media";
import Dialog from "./Dialog";
import type { DownloadResource } from "./types";

export function ResourceSummary({ resource }: { resource: DownloadResource }) {
  return <><div className="resource-version-tags">{resourceBadges(resource).map((value) => <span key={value}>{value}</span>)}</div>
    {resource.updatedAt ? <small>更新于 {new Date(resource.updatedAt).toLocaleDateString()}</small> : null}</>;
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
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    setError("");
    try { await copyText(resource.type === "115" && resource.code ? `${resource.url}\n提取码：${resource.code}` : resource.url); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000); }
    catch (error) { setError(error instanceof Error ? error.message : "复制失败。"); }
  }
  return <div className="download-row resource-link-row">
    <div className="resource-link-info"><strong>{resource.title}</strong><span className={`resource-access ${resource.access === "free" ? "free" : "vip"}`}>{resource.access === "free" ? "免费" : "VIP"}</span>
      <ResourceSummary resource={resource} /><small>{[resource.size, resource.note].filter(Boolean).join(" · ")}</small>{resource.code ? <small>提取码：{resource.code}</small> : null}
      <div className="resource-url-line">{href ? <a href={href} target="_blank" rel="noreferrer" title={resource.url}>{resource.url}</a> : <span className="resource-plain-text">{resource.url}</span>}
        <button type="button" className="copy-link-button" onClick={copy} title={copied ? "已复制" : resource.code ? "复制链接和提取码" : "复制链接"} aria-label={copied ? "已复制链接" : "复制链接"}>{copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "已复制" : "复制"}</span></button>
      </div>{error ? <small className="form-error" role="alert">{error}</small> : null}
    </div><div className="resource-actions">{href ? <a className="resource-open-button" href={href} target="_blank" rel="noreferrer"><ExternalLink size={16} />{resource.type === "magnet" ? "磁力下载" : "打开网盘"}</a> : null}
      <button className="resource-report-button" type="button" onClick={() => setReportOpen(true)}><Flag size={15} />失效反馈</button></div>
    {reportOpen ? <ReportDialog resource={resource} mediaId={mediaId} onClose={() => setReportOpen(false)} /> : null}
  </div>;
}
