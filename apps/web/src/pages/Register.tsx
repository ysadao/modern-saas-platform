import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ email, password, firstName, lastName });
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-panel">
        <p className="eyebrow">Harbor Workspace OS</p>
        <h1>Spin up a tenant in seconds.</h1>
        <p className="lede">You become OWNER of every organization you create. Invite ADMIN, MEMBER, or VIEWER later.</p>
      </aside>
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Create account</h2>
        {error && <p className="banner error">{error}</p>}
        <div className="row">
          <label>
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
        </div>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password (min 8)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Register"}
        </button>
        <p className="muted">
          Already have access? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
