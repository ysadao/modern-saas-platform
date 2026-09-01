import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { AuthLayout } from "./layout";

export function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("demo@harbor.app");
  const [password, setPassword] = useState("HarborDemo123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav("/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_UNVERIFIED") {
        setError("Email is not verified. Check your inbox or open the verify link.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Operate every tenant from one control plane."
      lede="Organizations, RBAC, and project isolation with a full audit trail — PostgreSQL-backed, with rotating sessions."
    >
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        <p className="demo-chip">demo@harbor.app · HarborDemo123!</p>
        {error && <p className="banner error">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Enter workspace"}
        </button>
        <p className="muted">
          No account? <Link to="/register">Create one</Link>
          {" · "}
          <Link to="/forgot">Forgot password</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
