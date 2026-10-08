import { Film, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { suggestMedia } from "../shared/catalog";
import type { MediaItem } from "./types";

export default function SearchBox({ items, query, onQuery, onSearch, onSelect }: { items: MediaItem[]; query: string; onQuery: (value: string) => void; onSearch: (value: string) => void; onSelect: (item: MediaItem) => void }) {
  const [open, setOpen] = useState(false); const [active, setActive] = useState(-1); const id = useId();
  const suggestions = useMemo(() => suggestMedia(items, query), [items, query]);
  const visible = open && suggestions.length > 0;
  function select(item: MediaItem) { setOpen(false); setActive(-1); onQuery(item.title); onSelect(item); }
  return <form className="search-box" onSubmit={(event) => { event.preventDefault(); if (visible && active >= 0 && active < suggestions.length) select(suggestions[active]); else { setOpen(false); onSearch(query); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <input name="query" maxLength={100} value={query} onChange={(event) => { onQuery(event.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} placeholder="搜索影视名" aria-label="搜索影视名" autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={Boolean(visible)} aria-controls={visible ? id : undefined} aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
      onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setActive(-1); } if (!visible) return; if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setActive((value) => event.key === "ArrowDown" ? (value + 1) % suggestions.length : (value <= 0 ? suggestions.length : value) - 1); } }} />
    <button type="submit" title="搜索" aria-label="搜索"><Search size={20} /></button>
    {visible ? <div className="search-suggestions" id={id} role="listbox" aria-label="片名联想">{suggestions.map((item, index) => <div key={item.id} id={`${id}-${index}`} role="option" aria-selected={active === index} className={active === index ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => select(item)}>
      <Film size={17} /><span><strong>{item.title}</strong><small>{item.year ?? "未知年份"} · {item.category}{item.originalTitle ? ` · ${item.originalTitle}` : ""}</small></span>
    </div>)}</div> : null}
  </form>;
}
