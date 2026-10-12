import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { SiteProvider } from "./SiteContext";

const Page = React.lazy(() => window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")
  ? import("./AdminApp") : import("./App"));

class PageBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="public-login-page"><div className="public-access-status" role="alert"><span>页面加载失败，请重新加载。</span><button className="primary-action" type="button" onClick={() => location.reload()}>重新加载</button></div></main> : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PageBoundary><SiteProvider><React.Suspense fallback={<div className="admin-gate">正在加载…</div>}>
      <Page />
    </React.Suspense></SiteProvider></PageBoundary>
  </React.StrictMode>
);
