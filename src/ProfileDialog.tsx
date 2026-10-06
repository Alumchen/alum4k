import { LockKeyhole, Save, Trash2, Upload, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { changePassword, saveProfile } from "./api";
import Dialog from "./Dialog";
import { readSmallImage } from "./imageUpload";
import type { User } from "./types";

export default function ProfileDialog({ user, onClose, onChange }: { user: User; onClose: () => void; onChange: (user: User) => void }) {
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(user.displayName || user.username);
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [bio, setBio] = useState(user.bio || "");
  const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (tab === "profile") { onChange(await saveProfile({ displayName: name, avatar, bio })); setNotice("个人信息已保存。"); }
      else {
        if (password !== confirm) throw new Error("两次密码输入不一致。");
        onChange((await changePassword(current, password)).user); setCurrent(""); setPassword(""); setConfirm(""); setNotice("密码已修改，其他登录会话已失效。");
      }
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  return <Dialog title="个人信息" onClose={() => { if (!busy) onClose(); }}>
    <div className="account-tabs" role="tablist" aria-label="个人信息选项">
      <button type="button" disabled={busy} role="tab" aria-selected={tab === "profile"} onClick={() => { setTab("profile"); setError(""); setNotice(""); }}><UserRound size={16} />资料</button>
      <button type="button" disabled={busy} role="tab" aria-selected={tab === "password"} onClick={() => { setTab("password"); setError(""); setNotice(""); }}><LockKeyhole size={16} />修改密码</button>
    </div>
    <form className="auth-fields" onSubmit={submit}><fieldset disabled={busy} className="account-fields">
      {tab === "profile" ? <>
        <div className="profile-avatar-editor"><div className="profile-avatar">{avatar ? <img src={avatar} alt="头像预览" /> : <UserRound size={32} />}</div>
          <label className="upload-control"><Upload size={16} />上传头像<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传头像" disabled={busy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { setAvatar(await readSmallImage(file, true)); } catch (error) { setError(error instanceof Error ? error.message : "上传失败。"); } finally { setBusy(false); event.target.value = ""; } }} /></label>
          <button type="button" title="移除头像" disabled={!avatar} onClick={() => setAvatar("")}><Trash2 size={16} /></button>
        </div>
        <label>账号<input value={user.username} readOnly /></label>
        <label>名称<input required maxLength={30} value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" /></label>
        <label>个人介绍<textarea aria-label="个人介绍" maxLength={160} rows={3} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
      </> : <>
        <label>当前密码<input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required maxLength={128} /></label>
        <label>新密码<input type="password" autoComplete="new-password" required minLength={user.role === "admin" ? 10 : 6} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>确认新密码<input type="password" autoComplete="new-password" required maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      </>}
    </fieldset>{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
      <button className="primary-action" type="submit" disabled={busy}><Save size={16} />{busy ? "保存中…" : tab === "profile" ? "保存资料" : "修改密码"}</button>
    </form>
  </Dialog>;
}
