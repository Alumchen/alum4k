import { ArrowLeft, Film, Loader2, LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { fetchCurrentUser, fetchMedia, login, setAuthToken } from "./api";
import AdminPanel from "./AdminPanel";
import type { MediaItem, User } from "./types";
import { BrandMark, useSite } from "./SiteContext";

export default function AdminApp() {
  const { settings } = useSite();
  const [user, setUser] = useState<User | null>(null);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function refreshLibrary() { setLibrary(await fetchMedia()); }
  useEffect(() => {
    fetchCurrentUser().then((next) => { setUser(next); if (next && next.role !== "admin") setMessage("当前账号没有后台权限，请使用管理员账号登录。"); })
      .catch(() => setMessage("暂时无法连接服务器，请稍后重试。"))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (user?.role !== "admin") return;
    refreshLibrary().then(() => { setReady(true); setMessage(""); }).catch((error) => setMessage(error.message));
  }, [user?.username, user?.role]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await login(username, password);
      setUser(result.user);
      if (result.user.role !== "admin") setMessage("此账号没有管理员权限。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败。"); }
    finally { setBusy(false); }
  }
  function logout() { setAuthToken(""); setUser(null); setLibrary([]); setReady(false); setPassword(""); setMessage(""); }
  useEffect(() => {
    function expire() { logout(); setMessage("登录已失效，请重新登录。"); }
    window.addEventListener("alum4k:session-expired", expire);
    return () => window.removeEventListener("alum4k:session-expired", expire);
  }, []);

  if (checking) return <div className="admin-gate"><Loader2 className="spin" size={26} /><span>正在验证账号…</span></div>;
  if (user?.role === "admin") {
    if (!ready) return <div className="admin-gate"><Loader2 className="spin" size={26} /><span>{message || "正在读取媒体库…"}</span>{message ? <button type="button" onClick={() => refreshLibrary().then(() => { setReady(true); setMessage(""); }).catch((error) => setMessage(error.message))}>重试</button> : null}</div>;
    return <AdminPanel library={library} currentUser={user} onLibraryChange={refreshLibrary} onLogout={logout} />;
  }
  return <main className="admin-login-page">
    <a className="admin-login-brand" href="/"><BrandMark /><span>{settings.branding.name}</span></a>
    <form className="admin-login-form auth-fields" onSubmit={submit}>
      <LockKeyhole size={28} className="admin-login-icon" /><h1>管理员登录</h1>
      <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
      <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required minLength={6} /></label>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <button type="submit" className="primary-action" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <LogIn size={17} />}{busy ? "正在登录…" : "登录后台"}</button>
      <a className="admin-return-link" href="/"><ArrowLeft size={15} />返回网站</a>
    </form>
  </main>;
}
