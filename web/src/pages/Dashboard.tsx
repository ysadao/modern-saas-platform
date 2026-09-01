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
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="New organization name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Create tenant</button>
      </form>
      <div className="grid">
        {orgs.map((org) => (
          <Link className="card" key={org.id} to={`/orgs/${org.id}`}>
            <p className="eyebrow">{org.role}</p>
            <h3>{org.name}</h3>
            <p className="mono">{org.slug}</p>
          </Link>
        ))}
        {orgs.length === 0 && <p className="muted">No organizations yet. Create one to become OWNER.</p>}
      </div>
    </Shell>
  );
}
