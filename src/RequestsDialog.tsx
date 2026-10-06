import { Film, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { fetchRequests, submitRequest } from "./api";
import { requestStatusLabels } from "../shared/community";
import type { FilmRequest } from "./types";
import Dialog from "./Dialog";

export default function RequestsDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<FilmRequest[]>([]); const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(""); const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [year, setYear] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function load() { setLoading(true); setError(""); try { setItems(await fetchRequests()); } catch (error) { setError(error instanceof Error ? error.message : "加载失败。"); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const item = await submitRequest({ title, mediaType, year: year ? Number(year) : undefined, note }); setItems((items) => [item, ...items]); setTitle(""); setYear(""); setNote(""); setNotice("求片需求已提交。"); }
    catch (error) { setError(error instanceof Error ? error.message : "提交失败。"); } finally { setBusy(false); }
  }
  return <Dialog title="求片" onClose={() => { if (!busy) onClose(); }} className="community-dialog">
    <form className="auth-fields" onSubmit={submit}><fieldset disabled={busy} className="account-fields">
      <label>影视名称<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="form-columns"><label>影视类型<select value={mediaType} onChange={(event) => setMediaType(event.target.value as "movie" | "tv")}><option value="movie">电影</option><option value="tv">电视剧</option></select></label>
        <label>年份<input type="number" min={1880} max={2200} value={year} onChange={(event) => setYear(event.target.value)} /></label></div>
      <label>需求说明<textarea aria-label="需求说明" maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    </fieldset>{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
      <button type="submit" className="primary-action" disabled={busy}><Send size={16} />{busy ? "提交中…" : "提交求片"}</button></form>
    <h3 className="community-heading">我的需求</h3>
    {loading ? <p className="muted">正在加载…</p> : !items.length ? <p className="muted">暂无求片记录</p> : <div className="request-history">{items.map((item) => <article key={item.id} className="request-item">
      <div><strong><Film size={15} />{item.title}{item.year ? ` (${item.year})` : ""}</strong><span className={`request-status ${item.status}`}>{requestStatusLabels[item.status]}</span></div>
      <small>{item.mediaType === "movie" ? "电影" : "电视剧"} · {new Date(item.createdAt).toLocaleDateString()}</small>
      {item.note ? <p>{item.note}</p> : null}{item.reply ? <p className="request-reply">管理员回复：{item.reply}</p> : null}
    </article>)}</div>}
  </Dialog>;
}
