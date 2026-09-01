import { FormEvent, useState } from "react";
import { api } from "../api";
import { AuthLayout, AuthLinks } from "./layout";

export function Forgot() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ ok: boolean; resetToken?: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setOk(true);
      setResetToken(data.resetToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset access without leaving the dock." lede="If the email exists we queue a reset token. In demo mode the token is returned in the API response.">
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Forgot password</h2>
        {error && <p className="banner error">{error}</p>}
        {ok && <p className="banner ok">If that account exists, a reset token was issued.</p>}
        {resetToken && (
          <p className="demo-chip">
            Demo token: <a href={`/reset?token=${encodeURIComponent(resetToken)}`}>open reset link</a>
          </p>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reset"}
        </button>
        <AuthLinks />
      </form>
    </AuthLayout>
  );
}
