import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { SiteProvider } from "./SiteContext";
import { isMediaArea } from "../shared/paths";

const path = window.location.pathname;
const workbenchAdmin = path === "/admin" || path.startsWith("/admin/");
const media = isMediaArea(path);
const Page = React.lazy(() => workbenchAdmin || /^\/yingshi\/admin(?:\/|$)/.test(path) ? import("./AdminApp") : media ? import("./App") : import("./WorkbenchApp"));
const content = <React.Suspense fallback={<div className="admin-gate">正在加载…</div>}><Page {...(workbenchAdmin ? { scope: "workbench" as const } : {})} /></React.Suspense>;

class PageBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="public-login-page"><div className="public-access-status" role="alert"><span>页面加载失败，请重新加载。</span><button className="primary-action" type="button" onClick={() => location.reload()}>重新加载</button></div></main> : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PageBoundary>{media || workbenchAdmin ? <SiteProvider>{content}</SiteProvider> : content}</PageBoundary>
  </React.StrictMode>
);
