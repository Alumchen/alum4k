import { Copy, Plus, RefreshCcw, Save, Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { disableInvitation, fetchInvitations, fetchRequests, generateInvitation, updateRequest } from "./api";
import { copyText } from "./clipboard";
import { requestStatusLabels, requestStatuses } from "../shared/community";
import type { FilmRequest, Invitation } from "./types";

export function InvitationAdmin() {
  const [items, setItems] = useState<Invitation[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [loaded, setLoaded] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "操作失败。"); } finally { setBusy(false); } }
  async function load() { setItems(await fetchInvitations()); setLoaded(true); }
  useEffect(() => { run(load); }, []);
  return <section><div className="admin-toolbar"><span className="muted">{items.filter((item) => !item.usedAt && !item.disabled).length} 个可用邀请码</span><div className="toolbar-spacer" />
    <button type="button" disabled={busy} title="刷新邀请码" onClick={() => run(load)}><RefreshCcw size={16} /></button>
    <button type="button" className="primary-action" disabled={busy} onClick={() => run(async () => { const code = await generateInvitation(); setItems((items) => [code, ...items]); setNotice(`邀请码 ${code.code} 已生成。`); })}><Plus size={16} />生成邀请码</button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
    {!loaded ? <p className="muted">{busy ? "加载中…" : "无法加载邀请码，请刷新重试。"}</p> : !items.length ? <div className="admin-empty">暂无邀请码</div> : <div className="admin-table-wrap"><table className="admin-table invitation-table"><thead><tr><th>邀请码</th><th>状态</th><th>创建时间</th><th>使用用户</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.code}>
      <td><code>{item.code}</code></td><td>{item.usedAt ? "已使用" : item.disabled ? "已停用" : "可用"}</td><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.usedBy || "—"}</td>
      <td><div className="table-actions"><button type="button" title={`复制邀请码 ${item.code}`} disabled={busy || item.disabled || Boolean(item.usedAt)} onClick={() => run(async () => { await copyText(item.code); setNotice("邀请码已复制。"); })}><Copy size={16} /></button><button type="button" title={`停用邀请码 ${item.code}`} disabled={busy || item.disabled || Boolean(item.usedAt)} onClick={() => { if (window.confirm(`停用邀请码 ${item.code}？`)) run(async () => { await disableInvitation(item.code); await load(); }); }}><Ban size={16} /></button></div></td>
    </tr>)}</tbody></table></div>}
  </section>;
}

function RequestRow({ item, onSaved }: { item: FilmRequest; onSaved: (item: FilmRequest) => void }) {
  const [status, setStatus] = useState(item.status); const [reply, setReply] = useState(item.reply);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => { setStatus(item.status); setReply(item.reply); }, [item]);
  return <article className="admin-request-row"><div className="request-summary"><strong>{item.title}{item.year ? ` (${item.year})` : ""}</strong><span>{item.mediaType === "movie" ? "电影" : "电视剧"} · {item.username} · {new Date(item.createdAt).toLocaleDateString()}</span>{item.note ? <p>{item.note}</p> : null}</div>
    <form className="request-admin-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setNotice(""); try { onSaved(await updateRequest(item.id, status, reply)); setNotice("需求处理已保存。"); } catch (error) { setError(error instanceof Error ? error.message : "保存失败。"); } finally { setBusy(false); } }}>
      <label>处理状态<select aria-label={`${item.title}处理状态`} disabled={busy} value={status} onChange={(event) => setStatus(event.target.value as FilmRequest["status"])}>{requestStatuses.map((status) => <option key={status} value={status}>{requestStatusLabels[status]}</option>)}</select></label>
      <label>管理员回复<textarea aria-label={`${item.title}管理员回复`} disabled={busy} maxLength={1000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
      <button type="submit" disabled={busy} className="primary-action"><Save size={16} />保存处理</button>
    </form>
  </article>;
}
export function RequestsAdmin() {
  const [items, setItems] = useState<FilmRequest[]>([]); const [status, setStatus] = useState("all"); const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  async function load() { setLoading(true); setError(""); try { setItems(await fetchRequests(true)); } catch (error) { setError(error instanceof Error ? error.message : "加载失败。"); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const filtered = items.filter((item) => (status === "all" || item.status === status) && `${item.title} ${item.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section><div className="admin-toolbar"><input aria-label="搜索求片需求" placeholder="搜索影视名" value={query} onChange={(event) => setQuery(event.target.value)} />
    <select aria-label="求片状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option>{requestStatuses.map((status) => <option key={status} value={status}>{requestStatusLabels[status]}</option>)}</select><span className="muted">{filtered.length} 条需求</span><div className="toolbar-spacer" /><button type="button" title="刷新求片需求" disabled={loading} onClick={load}><RefreshCcw size={16} /></button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}{loading ? <p className="muted">加载中…</p> : filtered.length ? filtered.map((item) => <RequestRow key={item.id} item={item} onSaved={(next) => setItems((items) => items.map((item) => item.id === next.id ? next : item))} />) : <div className="admin-empty">暂无匹配的求片需求</div>}
  </section>;
}
