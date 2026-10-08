import { RefreshCcw, Save, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type { ResourceReport } from "../shared/reports";
import { fetchResourceReports, updateResourceReport } from "./api";
import type { MediaItem } from "./types";

function ReportRow({ item, onSaved, onEdit }: { item: ResourceReport; onSaved: (item: ResourceReport) => Promise<void>; onEdit: () => void }) {
  const [status, setStatus] = useState(item.status); const [reply, setReply] = useState(item.reply); const [invalid, setInvalid] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  return <article className="admin-request-row"><div className="request-summary"><strong>{item.mediaTitle} · {item.resourceTitle}</strong><span>{item.reason} · {item.reporter} · {new Date(item.createdAt).toLocaleString()}</span><p>{item.note || "无补充说明"}</p><div className="report-row-actions"><button type="button" onClick={onEdit}><Pencil size={16} />编辑影视资源</button></div></div>
    <form className="request-admin-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const saved = await updateResourceReport(item.id, status, reply, invalid); await onSaved(saved); setInvalid(false); setMessage("反馈处理已保存。"); } catch (error) { setError(error instanceof Error ? error.message : "处理失败。"); } finally { setBusy(false); } }}>
      <label>反馈状态<select aria-label={`${item.mediaTitle}反馈状态`} value={status} disabled={busy} onChange={(event) => { setStatus(event.target.value as ResourceReport["status"]); setInvalid(false); }}><option value="pending">待处理</option><option value="resolved">已处理</option><option value="dismissed">已忽略</option></select></label>
      <label>处理说明<textarea aria-label={`${item.mediaTitle}处理说明`} rows={3} maxLength={1000} value={reply} disabled={busy} onChange={(event) => setReply(event.target.value)} /></label>
      <label className="switch-field"><input type="checkbox" disabled={busy || status !== "resolved"} checked={invalid} onChange={(event) => setInvalid(event.target.checked)} />同时标记该资源失效</label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="form-success" role="status">{message}</p> : null}<button className="primary-action" type="submit" disabled={busy}><Save size={16} />保存反馈处理</button>
    </form>
  </article>;
}
export default function ReportsAdmin({ library, onEdit, onLibraryChange }: { library: MediaItem[]; onEdit: (item: MediaItem) => void; onLibraryChange: () => Promise<void> }) {
  const [items, setItems] = useState<ResourceReport[]>([]); const [status, setStatus] = useState("pending"); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  async function load() { setLoading(true); setError(""); try { setItems(await fetchResourceReports()); } catch (error) { setError(error instanceof Error ? error.message : "加载失败。"); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const filtered = items.filter((item) => (status === "all" || item.status === status) && `${item.mediaTitle} ${item.resourceTitle}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section><div className="admin-toolbar"><input aria-label="搜索资源反馈" placeholder="搜索影视名" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="反馈状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部反馈</option><option value="pending">待处理</option><option value="resolved">已处理</option><option value="dismissed">已忽略</option></select><span className="muted">{filtered.length} 条反馈</span><div className="toolbar-spacer" /><button type="button" title="刷新反馈" disabled={loading} onClick={load}><RefreshCcw size={16} /></button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <p className="muted">正在读取反馈…</p> : !filtered.length ? <div className="admin-empty">暂无匹配反馈</div> : filtered.map((item) => <ReportRow key={item.id} item={item} onSaved={async (saved) => { setItems((items) => items.map((item) => item.id === saved.id ? saved : item)); await onLibraryChange(); }} onEdit={() => { const media = library.find((media) => media.id === item.mediaId); if (media) onEdit(media); else setError("该影视已删除，可将反馈标为已忽略。"); }} />)}
  </section>;
}
