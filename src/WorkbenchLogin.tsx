import { useEffect, useState, type FormEvent } from "react";
import Dialog from "./Dialog";
import { fetchSettings, login, register } from "./api";
import type { SiteSettings, User } from "./types";

export default function WorkbenchLogin({ onClose, onAuthed }: { onClose: () => void; onAuthed: (user: User) => void }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null); const [mode, setMode] = useState("login");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { try { setSettings(await fetchSettings()); setError(""); } catch { setError("暂时无法读取注册设置，请重试。"); } }
  useEffect(() => { load(); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const result = mode === "login" ? await login(username, password) : await register(username, password, code); onAuthed(result.user); onClose(); } catch (error) { setError(error instanceof Error ? error.message : "登录失败。"); } finally { setBusy(false); } }
  return <Dialog title={mode === "login" ? "登录工作台" : "注册"} onClose={onClose} className="auth-dialog"><form className="auth-fields" onSubmit={submit}>{mode === "register" && settings?.registration.hint ? <p className="registration-hint">{settings.registration.hint}</p> : null}<label>用户名<input required maxLength={20} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>密码<input required type="password" minLength={6} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{mode === "register" && settings?.registration.requireInvitation !== false ? <label>邀请码<input required pattern="[0-9]{8}" maxLength={8} inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} /></label> : null}{error ? <p role="alert" className="form-error">{error}</p> : null}<button type="submit" className="primary-action" disabled={busy || mode === "register" && !settings}>{busy ? "处理中…" : mode === "login" ? "登录" : "注册"}</button><button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setPassword(""); setError(""); }}>{mode === "login" ? "注册账号" : "已有账号？去登录"}</button>{!settings && error ? <button type="button" onClick={load}>重试</button> : null}</form></Dialog>;
}
