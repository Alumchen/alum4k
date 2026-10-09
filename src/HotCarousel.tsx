import { ChevronLeft, ChevronRight, Flame, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mediaPath } from "../shared/catalog";
import type { MediaItem } from "./types";

function HotImage({ item }: { item: MediaItem }) {
  const [source, setSource] = useState(item.backdropPath || item.posterPath);
  if (!source) return null;
  return <img className="hot-backdrop" src={source} alt="" fetchPriority="high" onError={() => setSource(source === item.backdropPath && item.posterPath !== source ? item.posterPath : "")} />;
}

export default function HotCarousel({ items, onSelect }: { items: MediaItem[]; onSelect: (item: MediaItem) => void }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const [paused, setPaused] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const index = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const item = items[index];
  const ids = items.map((film) => film.id).join("|");
  const stopped = paused || hovered || focused || hidden;
  function move(offset: number) { setSelectedId(items[(index + offset + items.length) % items.length].id); }
  useEffect(() => {
    function visibility() { setHidden(document.hidden); }
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (stopped || items.length < 2) return;
    const timer = window.setTimeout(() => setSelectedId(items[(index + 1) % items.length].id), 6500);
    return () => window.clearTimeout(timer);
  }, [stopped, index, ids, items]);
  if (!item) return null;
  return <section className="hot-carousel" aria-label="正在热播" aria-roledescription="轮播"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}
    tabIndex={items.length > 1 ? 0 : undefined}
    onTouchStart={(event) => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
    onTouchEnd={(event) => { const start = touch.current; touch.current = null; const end = event.changedTouches[0]; if (start && items.length > 1 && Math.abs(end.clientX - start.x) > 55 && Math.abs(end.clientX - start.x) > Math.abs(end.clientY - start.y)) move(end.clientX < start.x ? 1 : -1); }}>
    <div className="hot-slide" key={item.id} role="group" aria-roledescription="幻灯片" aria-label={`${index + 1} / ${items.length}：${item.title}`}>
      <HotImage key={`${item.backdropPath}|${item.posterPath}`} item={item} />
      <div className="hot-shade" />
      <div className="hot-copy">
        <span className="hot-kicker"><Flame size={16} />正在热播</span>
        <h1>{item.title}</h1>
        <p className="hot-meta">{[item.year, item.category, item.region, item.rating ? `TMDB ${item.rating}` : null].filter(Boolean).join(" · ")}</p>
        <p className="hot-overview">{item.overview || item.originalTitle || "暂无简介。"}</p>
        <a className="hot-detail" href={mediaPath(item)} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(item); }}>查看详情<ChevronRight size={17} /></a>
      </div>
    </div>
    {items.length > 1 ? <div className="hot-controls">
      <div className="hot-pages">{items.map((film, position) => <button key={film.id} type="button" aria-label={`展示${film.title}`} title={film.title} aria-current={position === index ? "true" : undefined} onClick={() => setSelectedId(film.id)}><span /></button>)}</div>
      <span className="hot-counter" aria-live={stopped ? "polite" : "off"}>{index + 1} / {items.length}</span>
      <button type="button" title={paused ? "开始自动轮播" : "暂停自动轮播"} aria-label={paused ? "开始自动轮播" : "暂停自动轮播"} onClick={() => setPaused(!paused)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
      <button type="button" title="上一部" aria-label="上一部" onClick={() => move(-1)}><ChevronLeft size={20} /></button>
      <button type="button" title="下一部" aria-label="下一部" onClick={() => move(1)}><ChevronRight size={20} /></button>
    </div> : null}
  </section>;
}
