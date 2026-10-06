import { Bell, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useSite } from "./SiteContext";
import Dialog from "./Dialog";

export function useNotices() {
  const { settings } = useSite();
  const items = settings.bulletins.filter((item) => item.enabled);
  return items.length ? items : settings.announcement.enabled ? [{ id: "popup", type: "announcement" as const, enabled: true, title: settings.announcement.title, content: settings.announcement.content, image: "", link: "" }] : [];
}
export function BoardDialog({ onClose }: { onClose: () => void }) {
  const items = useNotices();
  return <Dialog title="公告栏" onClose={onClose} className="community-dialog">
    {!items.length ? <p className="muted">暂无公告</p> : <div className="bulletin-list">{items.map((item) => <article key={item.id} className="bulletin-item">
      <div className="bulletin-heading"><h3>{item.title}</h3><span>{item.type === "advertisement" ? "广告" : "公告"}</span></div>
      {item.image ? <img src={item.image} alt={item.title} /> : null}{item.content ? <p>{item.content}</p> : null}
      {item.link ? <a href={item.link} target="_blank" rel={item.type === "advertisement" ? "sponsored noreferrer" : "noreferrer"}><ExternalLink size={16} />查看详情</a> : null}
    </article>)}</div>}
  </Dialog>;
}
export default function NoticeBoard() {
  const items = useNotices(); const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return <><section className="notice-board" aria-label="公告栏"><Bell size={17} /><span>公告栏</span><div>{items.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => setOpen(true)}>{item.type === "advertisement" ? <small>广告</small> : null}{item.title}</button>)}</div><button type="button" onClick={() => setOpen(true)} className="notice-more">全部</button></section>{open ? <BoardDialog onClose={() => setOpen(false)} /> : null}</>;
}
