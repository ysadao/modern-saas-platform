import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Shell } from "./layout";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
  memberCount?: number;
  projectCount?: number;
  auditCount?: number;
}

export function Dashboard() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api<{ organizations: Org[] }>("/api/organizations");
    setOrgs(data.organizations);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/organizations", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create organization");
    }
  }

  return (
    <Shell>
      <header className="page-head">
        <p className="eyebrow">Control plane</p>
        <h1>Organizations</h1>
      </header>
      {error && <p className="banner error">{error}</p>}
      <div className="stats">
        <article className="stat">
          <p className="eyebrow">Tenants</p>
          <strong>{orgs.length}</strong>
        </article>
        <article className="stat">
          <p className="eyebrow">Projects</p>
          <strong>{orgs.reduce((n, o) => n + (o.projectCount ?? 0), 0)}</strong>
        </article>
        <article className="stat">
          <p className="eyebrow">Members</p>
          <strong>{orgs.reduce((n, o) => n + (o.memberCount ?? 0), 0)}</strong>
        </article>
        <article className="stat">
          <p className="eyebrow">Audit events</p>
          <strong>{orgs.reduce((n, o) => n + (o.auditCount ?? 0), 0)}</strong>
        </article>
      </div>
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="New organization name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Create tenant</button>
      </form>
      <table className="data">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Slug</th>
            <th>Role</th>
            <th>Members</th>
            <th>Projects</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id}>
              <td>
                <Link to={`/orgs/${org.id}`}>{org.name}</Link>
              </td>
              <td className="mono">{org.slug}</td>
              <td>
                <span className="pill">{org.role}</span>
              </td>
              <td>{org.memberCount ?? "—"}</td>
              <td>{org.projectCount ?? "—"}</td>
              <td className="mono">{new Date(org.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {orgs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No organizations yet. Create one to become OWNER.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Shell>
  );
}
