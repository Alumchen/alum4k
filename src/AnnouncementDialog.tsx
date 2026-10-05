import { Bell } from "lucide-react";
import Dialog from "./Dialog";
import type { Announcement } from "./types";

export function shouldShowAnnouncement(announcement: Announcement) {
  if (!announcement.enabled || !announcement.content.trim()) return false;
  try {
    const key = `alum4k_announcement_${announcement.revision}`;
    if (announcement.frequency === "session") return sessionStorage.getItem(key) !== "dismissed";
    if (announcement.frequency === "daily") return localStorage.getItem(key) !== new Date().toLocaleDateString();
  } catch { /* Private browsing may disable storage. */ }
  return true;
}

export function dismissAnnouncement(announcement: Announcement) {
  try {
    const key = `alum4k_announcement_${announcement.revision}`;
    if (announcement.frequency === "session") sessionStorage.setItem(key, "dismissed");
    if (announcement.frequency === "daily") localStorage.setItem(key, new Date().toLocaleDateString());
  } catch { /* The dialog can still close when storage is unavailable. */ }
}

export default function AnnouncementDialog({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  return <Dialog title={announcement.title} onClose={onClose} className="announcement-dialog">
    <div className="announcement-label"><Bell size={15} /> Alum4K</div>
    <p className="announcement-content">{announcement.content}</p>
    <button className="primary-action" type="button" onClick={onClose}>我知道了</button>
  </Dialog>;
}
