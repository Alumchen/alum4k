import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { SiteProvider } from "./SiteContext";

const Page = React.lazy(() => window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")
  ? import("./AdminApp") : import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteProvider><React.Suspense fallback={<div className="admin-gate">正在加载…</div>}>
      <Page />
    </React.Suspense></SiteProvider>
  </React.StrictMode>
);
