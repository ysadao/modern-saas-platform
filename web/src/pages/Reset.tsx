import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AuthLayout, AuthLinks } from "./layout";

export function Reset() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      nav("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new harbor passphrase." lede="Reset tokens expire after one hour and revoke every existing session when consumed.">
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Reset password</h2>
        {error && <p className="banner error">{error}</p>}
        {!token && <p className="banner error">Missing token in the URL.</p>}
        <label>
          New password (min 8)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        <button type="submit" disabled={busy || !token}>
          {busy ? "Saving…" : "Update password"}
        </button>
        <AuthLinks />
      </form>
    </AuthLayout>
  );
}
