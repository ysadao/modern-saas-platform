import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthLayout } from "./layout";

export function Register() {
  const { user } = useAuth();
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
      const data = await api<{ verificationToken?: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      if (data.verificationToken) {
        nav(`/verify?token=${encodeURIComponent(data.verificationToken)}`);
      } else {
        nav("/verify");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Spin up a tenant in seconds." lede="You become OWNER of every organization you create. Invite ADMIN, MEMBER, or VIEWER later. Accounts require email verification before login.">
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
    </AuthLayout>
  );
}
