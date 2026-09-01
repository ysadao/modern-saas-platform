import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="mark" />
          Harbor
        </div>
        <p className="nav-label">Workspaces</p>
        <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/" end>
          Organizations
        </NavLink>
        <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/settings">
          Sessions
        </NavLink>
        <div className="spacer" />
        <div className="who">
          <strong>
            {user?.firstName} {user?.lastName}
          </strong>
          <span>{user?.email}</span>
          <button className="ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}

export function AuthLayout({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-panel">
        <p className="eyebrow">Harbor Workspace OS</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </aside>
      {children}
    </div>
  );
}

export function AuthLinks() {
  return (
    <p className="muted">
      <Link to="/login">Sign in</Link>
      {" · "}
      <Link to="/register">Create account</Link>
      {" · "}
      <Link to="/forgot">Forgot password</Link>
    </p>
  );
}
