import { AdminOperatorRole } from "@sylis/api-client/admin";
import {
  Activity,
  Bot,
  Database,
  FileText,
  Gauge,
  History,
  KeyRound,
  ListChecks,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from "@sylis/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import {
  adminIdentityCommands,
  adminSessionQuery,
  resetAdminClientState,
} from "../../modules/identity";

const allRoles = Object.values(AdminOperatorRole);

const navigation = [
  {
    label: "Overview",
    items: [["/", "概览", Gauge, allRoles]],
  },
  {
    label: "Lexicon",
    items: [
      [
        "/lexicon/sources",
        "Sources",
        Database,
        [AdminOperatorRole.LEXICON_OPERATOR],
      ],
      [
        "/lexicon/rights",
        "Rights",
        ShieldCheck,
        [AdminOperatorRole.LEXICON_OPERATOR],
      ],
      [
        "/lexicon/build-runs",
        "Build Runs",
        Activity,
        [AdminOperatorRole.LEXICON_OPERATOR],
      ],
      [
        "/lexicon/reviews",
        "Review Center",
        FileText,
        [AdminOperatorRole.CONTENT_REVIEWER],
      ],
      [
        "/lexicon/publish-runs",
        "Publish Runs",
        RefreshCw,
        [AdminOperatorRole.LEXICON_OPERATOR],
      ],
      [
        "/lexicon/releases",
        "Releases",
        ListChecks,
        [AdminOperatorRole.RELEASE_MANAGER],
      ],
    ],
  },
  {
    label: "Agent & Models",
    items: [
      [
        "/agent/runs",
        "Agent Runs",
        Bot,
        [
          AdminOperatorRole.AGENT_RELEASE_MANAGER,
          AdminOperatorRole.MODEL_OPERATOR,
          AdminOperatorRole.SECURITY_ADMIN,
        ],
      ],
      [
        "/agent/releases",
        "Agent Releases",
        ListChecks,
        [AdminOperatorRole.AGENT_RELEASE_MANAGER],
      ],
      [
        "/models/routes",
        "Model Routes",
        Settings,
        [AdminOperatorRole.MODEL_OPERATOR, AdminOperatorRole.SECURITY_ADMIN],
      ],
      [
        "/models/credentials",
        "Credentials",
        KeyRound,
        [AdminOperatorRole.MODEL_OPERATOR, AdminOperatorRole.SECURITY_ADMIN],
      ],
      [
        "/models/usage",
        "AI Usage",
        Activity,
        [AdminOperatorRole.MODEL_OPERATOR],
      ],
    ],
  },
  {
    label: "Assets & Jobs",
    items: [
      ["/assets", "Assets", Database, allRoles],
      ["/jobs", "Jobs", History, allRoles],
    ],
  },
  {
    label: "Users & Security",
    items: [
      [
        "/users/support",
        "User Support",
        Users,
        [AdminOperatorRole.SUPPORT, AdminOperatorRole.SECURITY_ADMIN],
      ],
      [
        "/security/operators",
        "Operator Roles",
        ShieldCheck,
        [AdminOperatorRole.SECURITY_ADMIN],
      ],
      [
        "/security/audit",
        "Audit",
        KeyRound,
        [AdminOperatorRole.SECURITY_ADMIN],
      ],
    ],
  },
  {
    label: "Deployments",
    items: [["/deployments", "Deployments", Database, allRoles]],
  },
] as const;

export function AdminShell() {
  const session = useQuery(adminSessionQuery);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const roles = new Set(session.data?.roles ?? []);
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
        <nav aria-label="Admin navigation">
          {navigation.map((group) => {
            const items = group.items.filter(([, , , requiredRoles]) =>
              requiredRoles.some((role) => roles.has(role)),
            );
            if (items.length === 0) return null;
            return (
              <div className="admin-nav__group" key={group.label}>
                <span className="admin-nav__label">{group.label}</span>
                {items.map(([to, label, Icon]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      isActive ? "is-active" : undefined
                    }
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <button
          type="button"
          className="admin-nav__logout"
          onClick={async () => {
            await adminIdentityCommands.logout();
            await resetAdminClientState(cache);
            navigate("/login", { replace: true });
          }}
        >
          <LogOut aria-hidden="true" size={17} />
          <span>退出登录</span>
        </button>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
