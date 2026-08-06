import { Bot, Library, Search, User } from "@sylis/components";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/study", label: "背单词", icon: Library },
  { to: "/ai", label: "AI", icon: Bot },
  { to: "/explore", label: "探索", icon: Search },
  { to: "/me", label: "我的", icon: User },
] as const;

export function PrimaryNavigation() {
  return (
    <nav className="primary-nav" aria-label="主导航">
      <a className="wordmark" href="/study" aria-label="Sylis">
        <span>S</span>
        <strong>Sylis</strong>
      </a>
      <div className="primary-nav__links">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? "is-active" : undefined)}
          >
            <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
