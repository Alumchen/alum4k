export const widgetDefinitions = [
  { id: "tasks", title: "待办事项" }, { id: "calendar", title: "日程安排" },
  { id: "projects", title: "我的项目" }, { id: "notes", title: "便签" }
] as const;
export type WidgetId = typeof widgetDefinitions[number]["id"];
export interface DashboardLayout { id: WidgetId; hidden: boolean; size: "small" | "wide"; }
export interface Task { id: string; title: string; done: boolean; priority: "high" | "normal" | "low"; projectId: string; dueDate: string; notes: string; }
export interface Project { id: string; name: string; description: string; }
export interface Note { id: string; title: string; content: string; }
export interface CalendarEvent { id: string; title: string; start: string; }
export interface Dashboard { revision: number; layout: DashboardLayout[]; tasks: Task[]; projects: Project[]; notes: Note[]; events: CalendarEvent[]; }
export const emptyDashboard = (): Dashboard => ({ revision: 0, layout: widgetDefinitions.map(({ id }) => ({ id, hidden: false, size: "small" })), tasks: [], projects: [], notes: [], events: [] });
export function localDate(date = new Date()) { const part = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); return ["year", "month", "day"].map((name) => part.find((item) => item.type === name)!.value).join("-"); }
