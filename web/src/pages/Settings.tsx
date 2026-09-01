import { useEffect, useState } from "react";
import { api } from "../api";
import { Shell } from "./layout";

interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export function Settings() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api<{ sessions: Session[] }>("/api/me/sessions");
    setSessions(data.sessions);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function revoke(id: string) {
    setError(null);
    try {
      await api(`/api/me/sessions/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  async function logoutAll() {
    setError(null);
    try {
      await api("/api/auth/logout-all", { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout-all failed");
    }
  }

  return (
    <Shell>
      <header className="page-head">
        <p className="eyebrow">Account</p>
        <h1>Sessions</h1>
      </header>
      {error && <p className="banner error">{error}</p>}
      <p className="muted">Refresh tokens are stored as SHA-256 hashes. Revoking a row invalidates that device immediately.</p>
      <p>
        <button type="button" className="danger" onClick={() => void logoutAll()}>
          Revoke all sessions
        </button>
      </p>
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>IP</th>
            <th>User agent</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td className="mono">{new Date(s.createdAt).toLocaleString()}</td>
              <td className="mono">{s.ip ?? "—"}</td>
              <td>{s.userAgent ?? "—"}</td>
              <td>
                <span className="pill">{s.revokedAt ? "REVOKED" : "ACTIVE"}</span>
              </td>
              <td>
                {!s.revokedAt && (
                  <button type="button" className="danger" onClick={() => void revoke(s.id)}>
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
