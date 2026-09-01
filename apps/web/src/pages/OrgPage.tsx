import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}
interface Member {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}
interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
}
interface Audit {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
}

export function OrgPage() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");

  async function load() {
    if (!id) return;
    const [o, m, p, a] = await Promise.all([
      api<Org>(`/api/organizations/${id}`),
      api<{ members: Member[] }>(`/api/organizations/${id}/members`),
      api<{ projects: Project[] }>(`/api/organizations/${id}/projects`),
      api<{ audit: Audit[] }>(`/api/organizations/${id}/audit`),
    ]);
    setOrg(o);
    setMembers(m.members);
    setProjects(p.projects);
    setAudit(a.audit);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function addProject(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      await api(`/api/organizations/${id}/projects`, {
        method: "POST",
        body: JSON.stringify({ name: projectName, description: projectDesc }),
      });
      setProjectName("");
      setProjectDesc("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      await api(`/api/organizations/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="mark" />
          Harbor
        </div>
        <p className="nav-label">Workspaces</p>
        <Link className="nav-item" to="/">
          Organizations
        </Link>
        <div className="spacer" />
        <div className="who">
          <strong>
            {user?.firstName} {user?.lastName}
          </strong>
          <span>{user?.email}</span>
          <button className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </nav>
      <main>
        <header className="page-head">
          <div>
            <p className="eyebrow">{org?.role ?? "…"}</p>
            <h1>{org?.name ?? "Organization"}</h1>
            <p className="mono">{org?.slug}</p>
          </div>
        </header>
        {error && <p className="banner error">{error}</p>}

        <section className="split">
          <div>
            <h2>Projects</h2>
            <form className="stack-form" onSubmit={addProject}>
              <input placeholder="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
              <input placeholder="Description" value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} />
              <button type="submit">Add project</button>
            </form>
            <ul className="list">
              {projects.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <span className="pill">{p.status}</span>
                  <p>{p.description || "No description"}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Members</h2>
            <form className="stack-form" onSubmit={invite}>
              <input type="email" placeholder="Invite by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="ADMIN">ADMIN</option>
                <option value="MEMBER">MEMBER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
              <button type="submit">Invite</button>
            </form>
            <ul className="list">
              {members.map((m) => (
                <li key={m.userId}>
                  <strong>
                    {m.firstName} {m.lastName}
                  </strong>
                  <span className="pill">{m.role}</span>
                  <p>{m.email}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2>Audit log</h2>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id}>
                  <td className="mono">{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.action}</td>
                  <td>{row.resourceType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
