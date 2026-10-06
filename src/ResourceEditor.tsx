import { Plus, Trash2 } from "lucide-react";
import { extractDownloadLink } from "../shared/media";
import type { DownloadResource } from "./types";

export function cleanResources(resources: DownloadResource[] = []) {
  return resources.filter((resource) => resource.url.trim()).map((resource) => {
    const extracted = extractDownloadLink(resource.type, resource.url);
    return { ...resource, url: extracted.url, code: extracted.code ?? resource.code };
  });
}

export default function ResourceEditor({ resources, defaultAccess, onChange }: {
  resources: DownloadResource[]; defaultAccess: "free" | "vip"; onChange: (resources: DownloadResource[]) => void;
}) {
  function empty(type: "115" | "magnet", id: string): DownloadResource {
    return { id, type, title: type === "115" ? "115网盘" : "磁力链接", url: "", access: defaultAccess };
  }
  function update(resource: DownloadResource, patch: Partial<DownloadResource>) {
    onChange(resources.some((entry) => entry.id === resource.id) ? resources.map((entry) => entry.id === resource.id ? { ...entry, ...patch } : entry) : [...resources, { ...resource, ...patch }]);
  }
  return <div className="download-editor-grid">{(["115", "magnet"] as const).map((type) => {
    const existing = resources.filter((resource) => resource.type === type);
    const rows = existing.length ? existing : [empty(type, `empty-${type}`)];
    const label = type === "115" ? "115 网盘链接" : "磁力链接";
    return <section className="resource-editor-group" key={type}>
      <header><h4>{type === "115" ? "115 网盘" : "磁力链接"}</h4><button type="button" title={`添加${label}`} aria-label={`添加${label}`} disabled={resources.length >= 500}
        onClick={() => onChange([...resources, empty(type, `res-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)])}><Plus size={17} /></button></header>
      {rows.map((resource, index) => <div className="resource-editor-row" key={resource.id}>
        <div className="resource-editor-row-head"><strong>{resource.title || label}{rows.length > 1 ? ` ${index + 1}` : ""}</strong><button type="button" title="移除链接" aria-label={`移除${label}${index + 1}`} onClick={() => onChange(resources.filter((entry) => entry.id !== resource.id))}><Trash2 size={15} /></button></div>
        <label className="resource-url-field">{label}<textarea aria-label={rows.length === 1 ? label : `${label} ${index + 1}`} value={resource.url} rows={3}
          onChange={(event) => update(resource, { url: event.target.value })} placeholder={type === "115" ? "粘贴 115 网盘链接" : "粘贴磁力链接"} /></label>
        <div className="resource-editor-options"><label>查看权限<select aria-label={`${label}${index + 1}查看权限`} value={resource.access ?? defaultAccess} onChange={(event) => update(resource, { access: event.target.value as "free" | "vip" })}><option value="free">免费查看</option><option value="vip">VIP 查看</option></select></label>
          {type === "115" ? <label>提取码<input aria-label={`${label}${index + 1}提取码`} value={resource.code ?? ""} onChange={(event) => update(resource, { code: event.target.value })} maxLength={32} /></label> : null}</div>
        <details><summary>资源详情</summary><div className="resource-editor-options"><label>名称<input value={resource.title} onChange={(event) => update(resource, { title: event.target.value })} /></label><label>大小<input value={resource.size ?? ""} onChange={(event) => update(resource, { size: event.target.value })} /></label></div><label>备注<input value={resource.note ?? ""} onChange={(event) => update(resource, { note: event.target.value })} /></label></details>
      </div>)}
    </section>;
  })}</div>;
}
