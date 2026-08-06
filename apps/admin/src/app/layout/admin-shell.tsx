import {
  Activity,
  Bot,
  Database,
  Gauge,
  History,
  KeyRound,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Users,
} from "@sylis/components";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  ["/", "概览", Gauge],
  ["/builds", "构建", Activity],
  ["/imports", "导入", Database],
  ["/releases", "Release", ListChecks],
  ["/jobs", "Jobs", History],
  ["/source-rights", "来源权利", ShieldCheck],
  ["/sources", "来源任务", RefreshCw],
  ["/ai-usage", "AI 用量", Activity],
  ["/runtime-ai", "AI 控制", Bot],
  ["/deployments", "部署", Database],
  ["/audit", "审计", KeyRound],
  ["/users", "用户支持", Users],
] as const;

export function AdminShell() {
  return (
    <div className="admin-frame">
      <aside className="admin-nav">
        <a className="admin-brand" href="/">
          <span>S</span>
          <div>
            <strong>Sylis</strong>
            <small>Operations</small>
          </div>
        </a>
        <nav>
          {navigation.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
